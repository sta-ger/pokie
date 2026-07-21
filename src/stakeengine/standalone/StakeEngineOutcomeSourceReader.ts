import fs from "fs";
import path from "path";
import zlib from "zlib";
import type {ValidationIssue} from "../../validation/ValidationIssue.js";
import {convertStakeUnitsToRatio} from "../internal/convertStakeUnitsToRatio.js";
import {parseStakeEngineOutcomeId} from "../internal/parseStakeEngineOutcomeId.js";
import {resolveSafeStakeEngineFilePath} from "../internal/resolveSafeStakeEngineFilePath.js";
import type {StakeEngineEvent} from "../StakeEngineEvent.js";
import type {StakeEngineOutcomeRecord} from "./StakeEngineOutcomeRecord.js";
import type {StakeEngineOutcomeSourceReadResult} from "./StakeEngineOutcomeSourceReadResult.js";
import type {StakeEngineOutcomeSourceReading} from "./StakeEngineOutcomeSourceReading.js";
import type {
    StakeEngineStandaloneBookLineResult,
    StakeEngineStandaloneBundle,
    StakeEngineStandaloneFileResult,
    StakeEngineStandaloneModeFiles,
} from "./StakeEngineStandaloneBundle.js";
import type {StakeEngineStandaloneMode} from "./StakeEngineStandaloneMode.js";
import {StakeEngineStandaloneValidator} from "./StakeEngineStandaloneValidator.js";
import type {StakeEngineStandaloneValidating} from "./StakeEngineStandaloneValidating.js";

// Reads and normalizes an arbitrary Stake Engine outcome directory into StakeEngineOutcomeRecord DTOs -- the only
// place in the standalone pipeline that ever touches the filesystem. Deliberately never looks for a
// pokie-manifest.json (see StakeEngineOutcomeSourceReading): "cost" per mode comes straight out of index.json,
// the one place a manifest-less directory ever records it, and events are normalized verbatim -- no attempt to
// reconstruct a RoundArtifact-shaped step model out of them (see StakeEngineOutcomeRecord's own doc comment for
// why).
export class StakeEngineOutcomeSourceReader implements StakeEngineOutcomeSourceReading {
    private readonly validator: StakeEngineStandaloneValidating;
    private readonly readFile: (filePath: string) => Buffer;
    private readonly decompress: (buffer: Buffer) => Buffer;

    constructor(
        validator: StakeEngineStandaloneValidating = new StakeEngineStandaloneValidator(),
        readFile: (filePath: string) => Buffer = (filePath) => fs.readFileSync(filePath),
        decompress: (buffer: Buffer) => Buffer = (buffer) => zlib.zstdDecompressSync(buffer),
    ) {
        this.validator = validator;
        this.readFile = readFile;
        this.decompress = decompress;
    }

    public readFromDirectory(stakeDir: string): Promise<StakeEngineOutcomeSourceReadResult> {
        try {
            const bundle = this.assembleBundle(stakeDir);

            const structuralIssues = this.validator.validate(bundle);
            if (structuralIssues.some((issue) => issue.severity === "error")) {
                return Promise.resolve({stakeDir, modes: [], issues: structuralIssues});
            }

            // Safe: validation passing with no errors guarantees index parsed to "ok" and matches the expected shape.
            const index = (bundle.index as {status: "ok"; value: unknown}).value as {modes: readonly {name: string; cost: number}[]};
            const modeFilesByName = new Map(bundle.modeFiles.map((modeFiles) => [modeFiles.modeName, modeFiles]));

            const buildIssues: ValidationIssue[] = [];
            const builtModes: StakeEngineStandaloneMode[] = [];
            for (const indexMode of index.modes) {
                const modeFiles = modeFilesByName.get(indexMode.name);
                if (modeFiles === undefined) {
                    // Unreachable once structural validation passed with no errors.
                    throw new Error(`mode "${indexMode.name}": missing mode files after successful validation.`);
                }
                const built = this.buildMode(modeFiles);
                buildIssues.push(...built.issues);
                builtModes.push(built.mode);
            }

            const allIssues = [...structuralIssues, ...buildIssues];
            if (allIssues.some((issue) => issue.severity === "error")) {
                return Promise.resolve({stakeDir, modes: [], issues: allIssues});
            }

            return Promise.resolve({stakeDir, modes: builtModes, issues: allIssues});
        } catch (error) {
            return Promise.reject(error);
        }
    }

    private buildMode(modeFiles: StakeEngineStandaloneModeFiles): {mode: StakeEngineStandaloneMode; issues: ValidationIssue[]} {
        // Safe: validation passing with no errors guarantees both files parsed to "ok" and every row/line is
        // structurally valid.
        const csvLines = (modeFiles.csv as {status: "ok"; value: readonly string[]}).value;
        const bookLineResults = (modeFiles.books as {status: "ok"; value: readonly StakeEngineStandaloneBookLineResult[]}).value;

        const weightById = new Map<number, number>();
        for (const line of csvLines) {
            const [idField, weightField] = line.split(",");
            const id = parseStakeEngineOutcomeId(idField);
            if (id !== undefined) {
                weightById.set(id, Number(weightField));
            }
        }

        const issues: ValidationIssue[] = [];
        const outcomes: StakeEngineOutcomeRecord[] = bookLineResults.map((lineResult) => {
            // Safe, same reasoning as above.
            const line = (lineResult as {status: "ok"; value: unknown}).value as {id: number; events: readonly StakeEngineEvent[]; payoutMultiplier: number};
            const weight = weightById.get(line.id);
            if (weight === undefined) {
                // Unreachable once structural validation (csv/books id-set cross-check) passed with no errors.
                throw new Error(`mode "${modeFiles.modeName}": outcome id ${line.id} has no matching lookup CSV weight after successful validation.`);
            }

            const ratio = convertStakeUnitsToRatio(line.payoutMultiplier, modeFiles.cost);
            if (ratio === undefined) {
                issues.push({
                    code: "stakeengine-standalone-outcome-ratio-not-representable",
                    severity: "warning",
                    message:
                        `mode "${modeFiles.modeName}": outcome ${line.id}'s payoutMultiplier (${line.payoutMultiplier}) can't be reversed to a ratio without hidden ` +
                        `rounding at this mode's cost (${modeFiles.cost}); "ratio" is left undefined for this outcome (the raw payoutMultiplier is unaffected).`,
                    details: {modeName: modeFiles.modeName, id: line.id},
                });
            }

            return {id: line.id, weight, payoutMultiplier: line.payoutMultiplier, ratio, events: line.events};
        });

        return {mode: {modeName: modeFiles.modeName, cost: modeFiles.cost, outcomes}, issues};
    }

    private assembleBundle(stakeDir: string): StakeEngineStandaloneBundle {
        const index = this.readJsonFile(path.join(stakeDir, "index.json"));

        const modeFiles: StakeEngineStandaloneModeFiles[] = [];
        if (
            index.status === "ok" &&
            typeof index.value === "object" &&
            index.value !== null &&
            Array.isArray((index.value as {modes?: unknown}).modes)
        ) {
            for (const rawMode of (index.value as {modes: unknown[]}).modes) {
                const modeName = (rawMode as {name?: unknown} | null)?.name;
                const cost = (rawMode as {cost?: unknown} | null)?.cost;
                const eventsFile = (rawMode as {events?: unknown} | null)?.events;
                const weightsFile = (rawMode as {weights?: unknown} | null)?.weights;
                if (typeof modeName !== "string" || typeof cost !== "number" || typeof eventsFile !== "string" || typeof weightsFile !== "string") {
                    continue;
                }

                modeFiles.push({
                    modeName,
                    cost,
                    csv: this.readCsvFile(stakeDir, weightsFile),
                    books: this.readBooksFile(stakeDir, eventsFile),
                });
            }
        }

        return {stakeDir, index, modeFiles};
    }

    // Path-safety is checked *before* any filesystem access -- resolveSafeStakeEngineFilePath refuses absolute
    // paths, ".."/nested paths, and anything that would resolve outside stakeDir, so an attacker-controlled
    // index.json can never make this reader read a file outside the outcome directory.
    // StakeEngineStandaloneValidator independently re-checks the same raw filenames directly and is what actually
    // surfaces a specific, user-facing diagnostic for this -- the "unreadable" result here is this method's own
    // defense-in-depth backstop.
    private readCsvFile(stakeDir: string, fileName: string): StakeEngineStandaloneFileResult<readonly string[]> {
        const resolvedPath = resolveSafeStakeEngineFilePath(stakeDir, fileName);
        if (resolvedPath === undefined) {
            return {status: "unreadable", error: `unsafe filename: ${JSON.stringify(fileName)}`};
        }
        if (!fs.existsSync(resolvedPath)) {
            return {status: "missing"};
        }
        try {
            const raw = this.readFile(resolvedPath);
            const lines = raw.toString("utf-8").split("\n").filter((line) => line.length > 0);
            return {status: "ok", value: lines};
        } catch (error) {
            return {status: "unreadable", error: error instanceof Error ? error.message : String(error)};
        }
    }

    private readBooksFile(stakeDir: string, fileName: string): StakeEngineStandaloneFileResult<readonly StakeEngineStandaloneBookLineResult[]> {
        const resolvedPath = resolveSafeStakeEngineFilePath(stakeDir, fileName);
        if (resolvedPath === undefined) {
            return {status: "unreadable", error: `unsafe filename: ${JSON.stringify(fileName)}`};
        }
        if (!fs.existsSync(resolvedPath)) {
            return {status: "missing"};
        }

        let raw: Buffer;
        try {
            raw = this.readFile(resolvedPath);
        } catch (error) {
            return {status: "unreadable", error: error instanceof Error ? error.message : String(error)};
        }

        let decompressed: Buffer;
        try {
            decompressed = this.decompress(raw);
        } catch (error) {
            return {status: "invalid", error: error instanceof Error ? error.message : String(error)};
        }

        const lines: StakeEngineStandaloneBookLineResult[] = decompressed
            .toString("utf-8")
            .split("\n")
            .filter((line) => line.length > 0)
            .map((line) => {
                try {
                    return {status: "ok", value: JSON.parse(line)};
                } catch (error) {
                    return {status: "invalid", error: error instanceof Error ? error.message : String(error)};
                }
            });
        return {status: "ok", value: lines};
    }

    private readJsonFile(filePath: string): StakeEngineStandaloneFileResult<unknown> {
        if (!fs.existsSync(filePath)) {
            return {status: "missing"};
        }

        let raw: Buffer;
        try {
            raw = this.readFile(filePath);
        } catch (error) {
            return {status: "unreadable", error: error instanceof Error ? error.message : String(error)};
        }

        try {
            return {status: "ok", value: JSON.parse(raw.toString("utf-8"))};
        } catch (error) {
            return {status: "invalid", error: error instanceof Error ? error.message : String(error)};
        }
    }
}
