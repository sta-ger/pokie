import crypto from "crypto";
import fs from "fs";
import path from "path";
import zlib from "zlib";
import {buildRoundArtifact} from "../artifact/buildRoundArtifact.js";
import {RoundArtifactBuildError} from "../artifact/RoundArtifactBuildError.js";
import type {RoundArtifact} from "../artifact/RoundArtifact.js";
import type {ValidationIssue} from "../validation/ValidationIssue.js";
import {buildWeightedOutcomeLibrary} from "../weightedoutcome/buildWeightedOutcomeLibrary.js";
import {WeightedOutcomeLibraryBuildError} from "../weightedoutcome/WeightedOutcomeLibraryBuildError.js";
import {convertRatioToStakeUnits} from "./internal/convertRatioToStakeUnits.js";
import {parseStakeEngineOutcomeId} from "./internal/parseStakeEngineOutcomeId.js";
import {resolveSafeStakeEngineFilePath} from "./internal/resolveSafeStakeEngineFilePath.js";
import {StakeEngineImportSyntheticWinComponent} from "./internal/StakeEngineImportSyntheticWinComponent.js";
import type {
    StakeEngineImportBookLineResult,
    StakeEngineImportBundle,
    StakeEngineImportFileResult,
    StakeEngineImportModeFiles,
} from "./StakeEngineImportBundle.js";
import {StakeEngineImportEventsError} from "./StakeEngineImportEventsError.js";
import type {StakeEngineExportModeInput} from "./StakeEngineExportModeInput.js";
import {StakeEngineImportInvariantError} from "./StakeEngineImportInvariantError.js";
import type {StakeEngineImporting} from "./StakeEngineImporting.js";
import type {StakeEngineImportResult} from "./StakeEngineImportResult.js";
import type {StakeEngineImportSourceProvenance} from "./StakeEngineImportSourceProvenance.js";
import type {StakeEngineImportValidating} from "./StakeEngineImportValidating.js";
import {StakeEngineImportValidator} from "./StakeEngineImportValidator.js";
import type {StakeEngineEvent} from "./StakeEngineEvent.js";
import type {StakeEngineIndexModeEntry} from "./StakeEngineIndex.js";
import type {StakeEngineManifest, StakeEngineManifestModeEntry} from "./StakeEngineManifest.js";
import {StakeEngineRoundEventsImporter} from "./StakeEngineRoundEventsImporter.js";
import type {StakeEngineRoundEventsImporting} from "./StakeEngineRoundEventsImporting.js";
import {WinEvaluationResult} from "../session/videoslot/winevaluation/WinEvaluationResult.js";
import type {WeightedOutcomeLibrary} from "../weightedoutcome/WeightedOutcomeLibrary.js";

// A single win evaluation import step's requirement — everything buildMode needs to construct one outcome.
type ImportModeContext = {
    readonly modeName: string;
    readonly cost: number;
    readonly manifestMode: StakeEngineManifestModeEntry;
    readonly manifest: StakeEngineManifest;
};

// The exact raw bytes assembleBundle actually read off disk for each file — captured once, at the only point
// this importer ever touches the filesystem, so computeSourceProvenance can hash precisely what was parsed/
// decompressed and built from, never a fresh read of whatever happens to be on disk afterward (which could have
// changed in the meantime, or simply be a wasted second syscall).
type RawModeBytes = {readonly csvBuffer: Buffer | undefined; readonly booksBuffer: Buffer | undefined};
type RawSourceBytes = {
    readonly indexBuffer: Buffer | undefined;
    readonly manifestBuffer: Buffer | undefined;
    readonly modes: ReadonlyMap<string, RawModeBytes>;
};

// Imports a Stake Engine export directory (index.json, per-mode lookup CSV, per-mode zstd-compressed JSONL
// books, and its own sibling pokie-manifest.json) back into one WeightedOutcomeLibrary per mode — the reverse of
// StakeEngineExporter. Only ever round-trips a directory "pokie stakeengine export" itself produced: betMode/
// stake/game/configHash/pokieVersion/libraryId are recovered from pokie-manifest.json (the only place they ever
// survive — Stake's own index.json/CSV/books never store them), never invented.
//
// This is inherently lossy at the POKIE-object level (see docs/stake-engine-import.md): the original RoundArtifact
// roundId, the real per-round win breakdown, and provenance.pokieVersion (the version that *built* the artifact,
// as opposed to the manifest's own pokieVersion, the version that *ran the export*) are never stored in Stake's
// format and can't be recovered — disclosed substitutes are used instead (a deterministic synthesized roundId,
// one synthetic win component per step, and the manifest's own pokieVersion). The real, testable round-trip
// property is at the Stake-format level: importing this directory and re-exporting the result (same modeName/
// cost) reproduces byte-identical index.json/CSV/books.jsonl.zst.
export class StakeEngineImporter<T extends string | number = string> implements StakeEngineImporting<T> {
    private readonly validator: StakeEngineImportValidating;
    private readonly eventsImporter: StakeEngineRoundEventsImporting<T>;
    private readonly readFile: (filePath: string) => Buffer;
    private readonly decompress: (buffer: Buffer) => Buffer;

    constructor(
        validator: StakeEngineImportValidating = new StakeEngineImportValidator(),
        eventsImporter: StakeEngineRoundEventsImporting<T> = new StakeEngineRoundEventsImporter<T>(),
        readFile: (filePath: string) => Buffer = (filePath) => fs.readFileSync(filePath),
        decompress: (buffer: Buffer) => Buffer = (buffer) => zlib.zstdDecompressSync(buffer),
    ) {
        this.validator = validator;
        this.eventsImporter = eventsImporter;
        this.readFile = readFile;
        this.decompress = decompress;
    }

    // Not "async" — same reasoning, and the same "still returns a Promise, still rejects rather than throws"
    // discipline, as StakeEngineExporter.exportToDirectory.
    public importFromDirectory(stakeDir: string): Promise<StakeEngineImportResult<T>> {
        try {
            const {bundle, rawBytes} = this.assembleBundle(stakeDir);

            const structuralIssues = this.validator.validate(bundle);
            if (structuralIssues.some((issue) => issue.severity === "error")) {
                return Promise.resolve({stakeDir, manifest: undefined, modes: [], sourceProvenance: undefined, issues: structuralIssues});
            }

            // Safe: validation passing with no errors guarantees both parsed to "ok" and match the expected shape.
            const manifest = (bundle.manifest as {status: "ok"; value: unknown}).value as StakeEngineManifest;
            const index = (bundle.index as {status: "ok"; value: unknown}).value as {modes: readonly StakeEngineIndexModeEntry[]};
            const modeFilesByName = new Map(bundle.modeFiles.map((modeFiles) => [modeFiles.modeName, modeFiles]));
            const manifestModesByName = new Map(manifest.modes.map((mode) => [mode.name, mode]));

            const buildIssues: ValidationIssue[] = [];
            const builtModes: StakeEngineExportModeInput<T>[] = [];

            for (const indexMode of index.modes) {
                const modeFiles = modeFilesByName.get(indexMode.name);
                const manifestMode = manifestModesByName.get(indexMode.name);
                if (modeFiles === undefined || manifestMode === undefined) {
                    // Unreachable once structural validation passed with no errors.
                    throw new StakeEngineImportInvariantError(`mode "${indexMode.name}": missing mode files or manifest entry after successful validation.`);
                }

                const context: ImportModeContext = {modeName: indexMode.name, cost: indexMode.cost, manifestMode, manifest};
                const built = this.buildMode(context, modeFiles);
                buildIssues.push(...built.issues);
                if (built.library !== undefined) {
                    builtModes.push({modeName: indexMode.name, cost: indexMode.cost, library: built.library});
                }
            }

            const allIssues = [...structuralIssues, ...buildIssues];
            if (allIssues.some((issue) => issue.severity === "error")) {
                return Promise.resolve({stakeDir, manifest: undefined, modes: [], sourceProvenance: undefined, issues: allIssues});
            }

            const sourceProvenance = this.computeSourceProvenance(index, rawBytes);
            return Promise.resolve({stakeDir, manifest, modes: builtModes, sourceProvenance, issues: allIssues});
        } catch (error) {
            return Promise.reject(error);
        }
    }

    // SHA-256 of each raw file this import actually read, exactly as it sat on disk — before any JSON-parsing/
    // decompression — computed from the very buffers assembleBundle captured while reading each file for real
    // parsing/decompression, never from a second, later read: the file could have changed on disk in the
    // meantime (a real TOCTOU risk, not just a hypothetical), and a second read is also simply wasted work once
    // the bytes are already in hand.
    private computeSourceProvenance(index: {modes: readonly StakeEngineIndexModeEntry[]}, rawBytes: RawSourceBytes): StakeEngineImportSourceProvenance {
        const hashOf = (buffer: Buffer | undefined): string => {
            if (buffer === undefined) {
                // Unreachable: computeSourceProvenance only ever runs once every file involved has already been
                // read successfully (a build/validation error short-circuits before this point).
                throw new StakeEngineImportInvariantError("source provenance requested for a file that was never actually read during import.");
            }
            return `sha256:${crypto.createHash("sha256").update(buffer).digest("hex")}`;
        };
        return {
            indexHash: hashOf(rawBytes.indexBuffer),
            manifestHash: hashOf(rawBytes.manifestBuffer),
            modes: index.modes.map((mode) => {
                const modeBytes = rawBytes.modes.get(mode.name);
                if (modeBytes === undefined) {
                    // Unreachable, same reasoning as hashOf's own guard above.
                    throw new StakeEngineImportInvariantError(`mode "${mode.name}": source bytes were never captured during import.`);
                }
                return {modeName: mode.name, csvHash: hashOf(modeBytes.csvBuffer), booksHash: hashOf(modeBytes.booksBuffer)};
            }),
        };
    }

    private buildMode(context: ImportModeContext, modeFiles: StakeEngineImportModeFiles): {library?: WeightedOutcomeLibrary<T>; issues: ValidationIssue[]} {
        const issues: ValidationIssue[] = [];
        // Safe: validation passing with no errors guarantees both files parsed to "ok".
        const csvLines = (modeFiles.csv as {status: "ok"; value: readonly string[]}).value;
        const bookLineResults = (modeFiles.books as {status: "ok"; value: readonly StakeEngineImportBookLineResult[]}).value;

        const weightById = new Map<number, number>();
        for (const line of csvLines) {
            const [idField, weightField] = line.split(",");
            const id = parseStakeEngineOutcomeId(idField);
            if (id !== undefined) {
                weightById.set(id, Number(weightField));
            }
        }

        const outcomes: {id: string; weight: number; artifact: RoundArtifact<T>}[] = [];
        for (const lineResult of bookLineResults) {
            // Safe: validation passing with no errors guarantees every line parsed to "ok" and matched the
            // expected shape.
            const line = (lineResult as {status: "ok"; value: unknown}).value as {id: number; events: unknown[]; payoutMultiplier: number};
            const weight = weightById.get(line.id);
            if (weight === undefined) {
                // Unreachable once structural validation (csv/books id-set cross-check) passed with no errors.
                throw new StakeEngineImportInvariantError(`mode "${context.modeName}": outcome id ${line.id} has no matching lookup CSV weight after successful validation.`);
            }

            const outcome = this.buildOutcome(context, line, weight, issues);
            if (outcome !== undefined) {
                outcomes.push(outcome);
            }
        }

        if (issues.length > 0) {
            return {issues};
        }

        try {
            const library = buildWeightedOutcomeLibrary<T>({libraryId: context.manifestMode.libraryId, outcomes});
            issues.push({
                code: "stakeengine-import-library-hash-differs-from-manifest",
                severity: "info",
                message:
                    `mode "${context.modeName}": the reconstructed library's hash is expected to differ from pokie-manifest.json's recorded ` +
                    `libraryHash (${context.manifestMode.libraryHash}) — roundId, the real win breakdown, and provenance.pokieVersion are not ` +
                    "recoverable from the Stake export and are substituted (see docs/stake-engine-import.md).",
                details: {modeName: context.modeName, manifestLibraryHash: context.manifestMode.libraryHash},
            });
            return {library, issues};
        } catch (error) {
            issues.push({
                code: "stakeengine-import-library-invalid",
                severity: "error",
                message: `mode "${context.modeName}": ${error instanceof WeightedOutcomeLibraryBuildError ? error.message : String(error)}`,
                details: {modeName: context.modeName},
            });
            return {issues};
        }
    }

    private buildOutcome(
        context: ImportModeContext,
        line: {id: number; events: unknown[]; payoutMultiplier: number},
        weight: number,
        issues: ValidationIssue[],
    ): {id: string; weight: number; artifact: RoundArtifact<T>} | undefined {
        let imported;
        try {
            imported = this.eventsImporter.importEvents(line.events as unknown as readonly StakeEngineEvent[], {
                cost: context.cost,
                stake: context.manifestMode.stake,
            });
        } catch (error) {
            issues.push({
                code: error instanceof StakeEngineImportEventsError ? error.getCode() : "stakeengine-import-outcome-events-invalid",
                severity: "error",
                message: `mode "${context.modeName}": outcome ${line.id}: ${error instanceof Error ? error.message : String(error)}`,
                details: {modeName: context.modeName, id: line.id},
            });
            return undefined;
        }

        // Cross-check the book line's own top-level "payoutMultiplier" field against its own events' finalWin
        // payoutMultiplier (before any reversal) — the exporter always writes these identically (both come from
        // the same computed value), so a mismatch means the file was tampered with or corrupted.
        const rawFinalWinPayoutMultiplier = (line.events[line.events.length - 1] as {payoutMultiplier?: unknown}).payoutMultiplier;
        if (rawFinalWinPayoutMultiplier !== line.payoutMultiplier) {
            issues.push({
                code: "stakeengine-import-book-line-payout-multiplier-mismatch",
                severity: "error",
                message: `mode "${context.modeName}": outcome ${line.id}'s own payoutMultiplier (${line.payoutMultiplier}) does not match its events' finalWin.payoutMultiplier (${String(rawFinalWinPayoutMultiplier)}).`,
                details: {modeName: context.modeName, id: line.id},
            });
            return undefined;
        }

        try {
            const artifact = buildRoundArtifact<T>({
                roundId: `stakeengine-import:${context.modeName}:${line.id}`,
                provenance: {
                    game: context.manifest.game,
                    pokieVersion: context.manifest.pokieVersion,
                    // Only set when actually present: an explicit "configHash: undefined" property (as opposed
                    // to the key being absent entirely) fails buildRoundArtifact's own JSON-safety check.
                    ...(context.manifest.configHash !== undefined ? {configHash: context.manifest.configHash} : {}),
                },
                betMode: context.manifestMode.betMode,
                stake: context.manifestMode.stake,
                steps: imported.steps.map((step) => ({
                    screen: step.screen,
                    winEvaluationResult:
                        step.totalWin > 0
                            ? new WinEvaluationResult<T>({winComponents: [new StakeEngineImportSyntheticWinComponent<T>(step.screen[0][0], step.totalWin)]})
                            : new WinEvaluationResult<T>(),
                    featureEvents: step.featureEvents,
                })),
                featureEvents: imported.roundFeatureEvents,
            });

            const selfCheck = convertRatioToStakeUnits(artifact.payoutMultiplier, context.cost);
            if (selfCheck !== line.payoutMultiplier) {
                throw new StakeEngineImportInvariantError(
                    `mode "${context.modeName}": outcome ${line.id}'s reconstructed payoutMultiplier does not re-convert to the original Stake value.`,
                );
            }

            return {id: String(line.id), weight, artifact};
        } catch (error) {
            if (error instanceof StakeEngineImportInvariantError) {
                throw error;
            }
            issues.push({
                code: "stakeengine-import-outcome-artifact-invalid",
                severity: "error",
                message: `mode "${context.modeName}": outcome ${line.id}: ${error instanceof RoundArtifactBuildError ? error.message : String(error)}`,
                details: {modeName: context.modeName, id: line.id},
            });
            return undefined;
        }
    }

    private assembleBundle(stakeDir: string): {bundle: StakeEngineImportBundle; rawBytes: RawSourceBytes} {
        const index = this.readJsonFile(path.join(stakeDir, "index.json"));
        const manifest = this.readJsonFile(path.join(stakeDir, "pokie-manifest.json"));

        const modeFiles: StakeEngineImportModeFiles[] = [];
        const modeBytes = new Map<string, RawModeBytes>();
        if (
            index.result.status === "ok" &&
            typeof index.result.value === "object" &&
            index.result.value !== null &&
            Array.isArray((index.result.value as {modes?: unknown}).modes)
        ) {
            for (const rawMode of (index.result.value as {modes: unknown[]}).modes) {
                const modeName = (rawMode as {name?: unknown} | null)?.name;
                const eventsFile = (rawMode as {events?: unknown} | null)?.events;
                const weightsFile = (rawMode as {weights?: unknown} | null)?.weights;
                if (typeof modeName !== "string" || typeof eventsFile !== "string" || typeof weightsFile !== "string") {
                    continue;
                }

                const csv = this.readCsvFile(stakeDir, weightsFile);
                const books = this.readBooksFile(stakeDir, eventsFile);
                modeFiles.push({modeName, csv: csv.result, books: books.result});
                modeBytes.set(modeName, {csvBuffer: csv.rawBuffer, booksBuffer: books.rawBuffer});
            }
        }

        return {
            bundle: {stakeDir, index: index.result, manifest: manifest.result, modeFiles},
            rawBytes: {indexBuffer: index.rawBuffer, manifestBuffer: manifest.rawBuffer, modes: modeBytes},
        };
    }

    // Path-safety is checked *before* any filesystem access — resolveSafeStakeEngineFilePath refuses absolute
    // paths, ".."/nested paths, and anything that would resolve outside stakeDir, so an attacker-controlled
    // index.json can never make this importer read (or, via the CLI's own output, write) a file outside the
    // export directory. StakeEngineImportValidator independently re-checks the same raw filenames directly
    // (see its own validateModeFilename) and is what actually surfaces a specific, user-facing diagnostic for
    // this — the "unreadable" result here is this method's own defense-in-depth backstop, not the primary
    // reporting path (unreachable in practice once validation runs, since it rejects an unsafe filename before
    // this mode's files would ever be cross-checked).
    //
    // Every read helper below returns its own raw buffer alongside the usual StakeEngineImportFileResult — the
    // exact bytes read off disk, before any parsing/decompression — so computeSourceProvenance can hash exactly
    // what was actually used to build the result, without ever reading a file a second time (see RawSourceBytes).
    private readCsvFile(stakeDir: string, fileName: string): {result: StakeEngineImportFileResult<readonly string[]>; rawBuffer: Buffer | undefined} {
        const resolvedPath = resolveSafeStakeEngineFilePath(stakeDir, fileName);
        if (resolvedPath === undefined) {
            return {result: {status: "unreadable", error: `unsafe filename: ${JSON.stringify(fileName)}`}, rawBuffer: undefined};
        }
        if (!fs.existsSync(resolvedPath)) {
            return {result: {status: "missing"}, rawBuffer: undefined};
        }
        try {
            const raw = this.readFile(resolvedPath);
            const lines = raw.toString("utf-8").split("\n").filter((line) => line.length > 0);
            return {result: {status: "ok", value: lines}, rawBuffer: raw};
        } catch (error) {
            return {result: {status: "unreadable", error: error instanceof Error ? error.message : String(error)}, rawBuffer: undefined};
        }
    }

    private readBooksFile(
        stakeDir: string,
        fileName: string,
    ): {result: StakeEngineImportFileResult<readonly StakeEngineImportBookLineResult[]>; rawBuffer: Buffer | undefined} {
        const resolvedPath = resolveSafeStakeEngineFilePath(stakeDir, fileName);
        if (resolvedPath === undefined) {
            return {result: {status: "unreadable", error: `unsafe filename: ${JSON.stringify(fileName)}`}, rawBuffer: undefined};
        }
        if (!fs.existsSync(resolvedPath)) {
            return {result: {status: "missing"}, rawBuffer: undefined};
        }

        let raw: Buffer;
        try {
            raw = this.readFile(resolvedPath);
        } catch (error) {
            return {result: {status: "unreadable", error: error instanceof Error ? error.message : String(error)}, rawBuffer: undefined};
        }

        let decompressed: Buffer;
        try {
            decompressed = this.decompress(raw);
        } catch (error) {
            return {result: {status: "invalid", error: error instanceof Error ? error.message : String(error)}, rawBuffer: raw};
        }

        const lines: StakeEngineImportBookLineResult[] = decompressed
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
        return {result: {status: "ok", value: lines}, rawBuffer: raw};
    }

    private readJsonFile(filePath: string): {result: StakeEngineImportFileResult<unknown>; rawBuffer: Buffer | undefined} {
        if (!fs.existsSync(filePath)) {
            return {result: {status: "missing"}, rawBuffer: undefined};
        }

        let raw: Buffer;
        try {
            raw = this.readFile(filePath);
        } catch (error) {
            return {result: {status: "unreadable", error: error instanceof Error ? error.message : String(error)}, rawBuffer: undefined};
        }

        try {
            return {result: {status: "ok", value: JSON.parse(raw.toString("utf-8"))}, rawBuffer: raw};
        } catch (error) {
            return {result: {status: "invalid", error: error instanceof Error ? error.message : String(error)}, rawBuffer: raw};
        }
    }
}
