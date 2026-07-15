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
import {StakeEngineImportSyntheticWinComponent} from "./internal/StakeEngineImportSyntheticWinComponent.js";
import {parseStakeEngineOutcomeId} from "./internal/parseStakeEngineOutcomeId.js";
import type {StakeEngineImportBundle, StakeEngineImportModeFiles} from "./StakeEngineImportBundle.js";
import {StakeEngineImportEventsError} from "./StakeEngineImportEventsError.js";
import {StakeEngineImportInvariantError} from "./StakeEngineImportInvariantError.js";
import type {StakeEngineExportModeInput} from "./StakeEngineExportModeInput.js";
import type {StakeEngineImporting} from "./StakeEngineImporting.js";
import type {StakeEngineImportResult} from "./StakeEngineImportResult.js";
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
            const bundle = this.assembleBundle(stakeDir);

            const structuralIssues = this.validator.validate(bundle);
            if (structuralIssues.some((issue) => issue.severity === "error")) {
                return Promise.resolve({stakeDir, manifest: undefined, modes: [], issues: structuralIssues});
            }

            const manifest = bundle.rawManifest as StakeEngineManifest;
            const index = bundle.rawIndex as {modes: readonly StakeEngineIndexModeEntry[]};
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
                return Promise.resolve({stakeDir, manifest: undefined, modes: [], issues: allIssues});
            }

            return Promise.resolve({stakeDir, manifest, modes: builtModes, issues: allIssues});
        } catch (error) {
            return Promise.reject(error);
        }
    }

    private buildMode(context: ImportModeContext, modeFiles: StakeEngineImportModeFiles): {library?: WeightedOutcomeLibrary<T>; issues: ValidationIssue[]} {
        const issues: ValidationIssue[] = [];
        const weightById = new Map<number, number>();
        for (const line of modeFiles.csvLines) {
            const [idField, weightField] = line.split(",");
            const id = parseStakeEngineOutcomeId(idField);
            if (id !== undefined) {
                weightById.set(id, Number(weightField));
            }
        }

        const outcomes: {id: string; weight: number; artifact: RoundArtifact<T>}[] = [];
        for (const rawLine of modeFiles.bookLines) {
            const line = rawLine as {id: number; events: unknown[]; payoutMultiplier: number};
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

    private assembleBundle(stakeDir: string): StakeEngineImportBundle {
        const indexPath = path.join(stakeDir, "index.json");
        const indexFileExists = fs.existsSync(indexPath);
        const rawIndex = indexFileExists ? this.tryReadJson(indexPath) : undefined;

        const manifestPath = path.join(stakeDir, "pokie-manifest.json");
        const manifestFileExists = fs.existsSync(manifestPath);
        const rawManifest = manifestFileExists ? this.tryReadJson(manifestPath) : undefined;

        const modeFiles: StakeEngineImportModeFiles[] = [];
        if (typeof rawIndex === "object" && rawIndex !== null && Array.isArray((rawIndex as {modes?: unknown}).modes)) {
            for (const rawMode of (rawIndex as {modes: unknown[]}).modes) {
                const modeName = (rawMode as {name?: unknown} | null)?.name;
                const eventsFile = (rawMode as {events?: unknown} | null)?.events;
                const weightsFile = (rawMode as {weights?: unknown} | null)?.weights;
                if (typeof modeName !== "string" || typeof eventsFile !== "string" || typeof weightsFile !== "string") {
                    continue;
                }

                const csvPath = path.join(stakeDir, weightsFile);
                const csvFileExists = fs.existsSync(csvPath);
                const csvLines = csvFileExists
                    ? this.readFile(csvPath).toString("utf-8").split("\n").filter((line) => line.length > 0)
                    : [];

                const booksPath = path.join(stakeDir, eventsFile);
                const booksFileExists = fs.existsSync(booksPath);
                const bookLines = booksFileExists ? this.readBookLines(booksPath) : [];

                modeFiles.push({modeName, csvFileExists, csvLines, booksFileExists, bookLines});
            }
        }

        return {stakeDir, indexFileExists, rawIndex, manifestFileExists, rawManifest, modeFiles};
    }

    private readBookLines(booksPath: string): unknown[] {
        let decompressed: Buffer;
        try {
            decompressed = this.decompress(this.readFile(booksPath));
        } catch {
            return [];
        }

        return decompressed
            .toString("utf-8")
            .split("\n")
            .filter((line) => line.length > 0)
            .map((line) => {
                try {
                    return JSON.parse(line);
                } catch {
                    return undefined;
                }
            });
    }

    private tryReadJson(filePath: string): unknown {
        try {
            return JSON.parse(this.readFile(filePath).toString("utf-8"));
        } catch {
            return undefined;
        }
    }
}
