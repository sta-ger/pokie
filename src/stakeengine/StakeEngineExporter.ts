import fs from "fs";
import path from "path";
import {InvalidJsonValueError} from "../json/InvalidJsonValueError.js";
import {toCanonicalJson} from "../json/toCanonicalJson.js";
import type {ValidationIssue} from "../validation/ValidationIssue.js";
import {computeWeightedOutcomeLibraryHash} from "../weightedoutcome/computeWeightedOutcomeLibraryHash.js";
import {assertSafeToReplaceStakeEngineExportDirectory} from "./internal/assertSafeToReplaceStakeEngineExportDirectory.js";
import {compressStakeEngineBooksJsonl} from "./internal/compressStakeEngineBooksJsonl.js";
import {convertRatioToStakeUnits} from "./internal/convertRatioToStakeUnits.js";
import {parseStakeEngineOutcomeId} from "./internal/parseStakeEngineOutcomeId.js";
import {publishDirectoryAtomically} from "./internal/publishDirectoryAtomically.js";
import {renderStakeEngineLookupCsv} from "./internal/renderStakeEngineLookupCsv.js";
import type {StakeEngineBookLine} from "./StakeEngineBookLine.js";
import type {StakeEngineEvent} from "./StakeEngineEvent.js";
import {StakeEngineExportInvariantError} from "./StakeEngineExportInvariantError.js";
import type {StakeEngineExportModeInput} from "./StakeEngineExportModeInput.js";
import {
    StakeEngineExportCancelledError,
    type StakeEngineExporting,
    type StakeEngineExportOptions,
} from "./StakeEngineExporting.js";
import type {StakeEngineExportResult} from "./StakeEngineExportResult.js";
import type {StakeEngineExportValidating} from "./StakeEngineExportValidating.js";
import {StakeEngineExportValidator} from "./StakeEngineExportValidator.js";
import type {StakeEngineIndex} from "./StakeEngineIndex.js";
import {STAKE_ENGINE_MANIFEST_SCHEMA_VERSION, type StakeEngineManifest, type StakeEngineManifestModeEntry} from "./StakeEngineManifest.js";
import {StakeEngineRoundEventsProjector} from "./StakeEngineRoundEventsProjector.js";
import type {StakeEngineRoundEventsProjecting} from "./StakeEngineRoundEventsProjecting.js";

const GENERATED_BY = "pokie stakeengine export";

type BuiltMode = {
    readonly csvFileName: string;
    readonly booksFileName: string;
    readonly csvContent: string;
    readonly booksBuffer: Buffer;
    readonly manifestEntry: StakeEngineManifestModeEntry;
};

type ModeBuildResult = {
    readonly issues: readonly ValidationIssue[];
    readonly built: BuiltMode | undefined;
};

// Exports one or more canonical WeightedOutcomeLibrary instances (one per Stake "mode") to the real Stake
// Engine math-sdk static file format (see https://stakeengine.github.io/math-sdk/rgs_docs/data_format/):
// index.json (Stake's own strict shape), a per-mode lookup CSV, and per-mode zstd-compressed JSONL books — plus
// a sibling pokie-manifest.json carrying POKIE's own provenance (index.json itself never gets extra fields).
// Never a second calculation path: every number written here already exists on the library's own outcomes/
// artifacts, converted into Stake's own integer unit convention (see convertRatioToStakeUnits), never recomputed
// or rounded.
//
// The whole output directory is replaced atomically: everything is built into a fresh temporary sibling
// directory first, and only swapped into place (a directory rename, see publishDirectoryAtomically) once every
// file has been written successfully. A failure at any point before the swap — a validation error, a projector
// throwing, a disk write failing — leaves an existing outDir completely untouched; a re-export into the same
// outDir starts from nothing (not the previous directory's contents), so a mode that no longer appears in this
// run's "modes" never leaves its old CSV/books behind.
export class StakeEngineExporter<T extends string | number = string> implements StakeEngineExporting<T> {
    private readonly pokieVersion: string;
    private readonly validator: StakeEngineExportValidating<T>;
    private readonly eventsProjector: StakeEngineRoundEventsProjecting<T>;
    private readonly now: () => Date;
    private readonly writeFile: (filePath: string, data: string | Buffer) => void;
    private readonly renameDirectory: (from: string, to: string) => void;
    private readonly removeDirectory: (dirPath: string) => void;

    constructor(
        pokieVersion: string,
        validator: StakeEngineExportValidating<T> = new StakeEngineExportValidator<T>(),
        eventsProjector: StakeEngineRoundEventsProjecting<T> = new StakeEngineRoundEventsProjector<T>(),
        now: () => Date = () => new Date(),
        writeFile: (filePath: string, data: string | Buffer) => void = (filePath, data) => fs.writeFileSync(filePath, data),
        renameDirectory: (from: string, to: string) => void = (from, to) => fs.renameSync(from, to),
        removeDirectory: (dirPath: string) => void = (dirPath) => fs.rmSync(dirPath, {recursive: true, force: true}),
    ) {
        this.pokieVersion = pokieVersion;
        this.validator = validator;
        this.eventsProjector = eventsProjector;
        this.now = now;
        this.writeFile = writeFile;
        this.renameDirectory = renameDirectory;
        this.removeDirectory = removeDirectory;
    }

    // Runs full validation itself (StakeEngineExportValidator, which always runs WeightedOutcomeLibraryValidator
    // against every mode's library first) — the caller never needs to validate first. Preflights the entire
    // export in memory before touching the filesystem at all: on any validation error (structural, or an
    // outcome's events/amounts turning out not to be representable in Stake units), nothing is written and an
    // existing outDir is left completely untouched. There is no partial export.
    // This is async specifically to yield between bounded outcome batches. That gives a UI/timer-driven
    // AbortSignal a chance to fire during a large export rather than only before its synchronous publish starts.
    public async exportToDirectory(
        modes: readonly StakeEngineExportModeInput<T>[],
        outDir: string,
        options?: StakeEngineExportOptions,
    ): Promise<StakeEngineExportResult> {
        assertNotCancelled(options);
        try {
            const structuralIssues = this.validator.validate(modes);
            if (structuralIssues.some((issue) => issue.severity === "error")) {
                return {outDir, files: [], manifest: undefined, issues: structuralIssues};
            }

            const buildResults: ModeBuildResult[] = [];
            let completed = BigInt(0);
            for (const mode of modes) {
                const result = await this.buildMode(mode, options, completed);
                buildResults.push(result);
                completed += BigInt(mode.library.outcomes.length);
            }
            const allIssues = [...structuralIssues, ...buildResults.flatMap((result) => result.issues)];
            if (allIssues.some((issue) => issue.severity === "error")) {
                return {outDir, files: [], manifest: undefined, issues: allIssues};
            }

            // Safe: no error-level issue above means every buildMode call returned a "built" result.
            const builtModes = buildResults.map((result) => result.built as BuiltMode);

            const index: StakeEngineIndex = {
                modes: modes.map((mode, position) => ({
                    name: mode.modeName,
                    cost: mode.cost,
                    events: builtModes[position].booksFileName,
                    weights: builtModes[position].csvFileName,
                })),
            };

            const relativeFiles = [
                ...builtModes.flatMap((builtMode) => [builtMode.csvFileName, builtMode.booksFileName]),
                "index.json",
                "pokie-manifest.json",
            ];

            const firstOutcome = modes[0].library.outcomes[0];
            const manifest: StakeEngineManifest = {
                schemaVersion: STAKE_ENGINE_MANIFEST_SCHEMA_VERSION,
                generatedBy: GENERATED_BY,
                pokieVersion: this.pokieVersion,
                generatedAt: this.now().toISOString(),
                game: firstOutcome.artifact.provenance.game,
                configHash: firstOutcome.artifact.provenance.configHash,
                ...(modes[0].sourceProvenance === undefined ? {} : {sourceProvenance: modes[0].sourceProvenance}),
                modes: builtModes.map((builtMode) => builtMode.manifestEntry),
                files: relativeFiles,
            };

            assertSafeToReplaceStakeEngineExportDirectory(outDir);
            assertNotCancelled(options);
            const cleanupWarning = this.writeToTempDirectoryThenSwap(outDir, builtModes, index, manifest, options, completed);
            const finalIssues = cleanupWarning !== undefined ? [...allIssues, cleanupWarning] : allIssues;

            return {outDir, files: relativeFiles, manifest, issues: finalIssues};
        } catch (error) {
            return Promise.reject(error);
        }
    }

    // Writes every file into a fresh temp sibling directory (never touching outDir itself), then swaps it into
    // place only once everything succeeded — delegated to the shared publishDirectoryAtomically primitive
    // (also used by StakeEngineImportWriter/StakeEngineBundleStreamingExporter), rather than a second,
    // hand-rolled copy of the same rename-swap algorithm. Converts its own string "cleanupWarning" into the
    // same "stakeengine-stale-export-cleanup-failed" warning ValidationIssue this class has always returned —
    // never thrown, since the export is already a success by that point (see publishDirectoryAtomically's own
    // doc comment for the full three-phase failure-handling guarantee: a temp-write failure leaves outDir
    // untouched, a publish-rename failure is rolled back or, in the one unrecoverable case, reported with the
    // stale backup's own path; only the final stale-cleanup step is ever downgraded to a warning).
    private writeToTempDirectoryThenSwap(
        outDir: string,
        builtModes: readonly BuiltMode[],
        index: StakeEngineIndex,
        manifest: StakeEngineManifest,
        options: StakeEngineExportOptions | undefined,
        completed: bigint,
    ): ValidationIssue | undefined {
        const {cleanupWarning} = publishDirectoryAtomically({
            outDir,
            renameDirectory: this.renameDirectory,
            removeDirectory: this.removeDirectory,
            writeFilesIntoTempDir: (tempDir) => {
                for (const builtMode of builtModes) {
                    assertNotCancelled(options);
                    this.writeFile(path.join(tempDir, builtMode.csvFileName), builtMode.csvContent);
                    options?.onProgress?.({completed, message: `Publishing Stake file ${builtMode.csvFileName}`});
                    assertNotCancelled(options);
                    assertNotCancelled(options);
                    this.writeFile(path.join(tempDir, builtMode.booksFileName), builtMode.booksBuffer);
                    options?.onProgress?.({completed, message: `Publishing Stake file ${builtMode.booksFileName}`});
                    assertNotCancelled(options);
                }
                assertNotCancelled(options);
                this.writeFile(path.join(tempDir, "index.json"), `${JSON.stringify(index, null, 4)}\n`);
                options?.onProgress?.({completed, message: "Publishing Stake file index.json"});
                assertNotCancelled(options);
                assertNotCancelled(options);
                this.writeFile(path.join(tempDir, "pokie-manifest.json"), `${JSON.stringify(manifest, null, 4)}\n`);
                options?.onProgress?.({completed, message: "Publishing Stake file pokie-manifest.json"});
                // The final callback is still a cancellation boundary: returning from this closure
                // authorizes publishDirectoryAtomically to commit its temp directory.
                assertNotCancelled(options);
            },
        });

        assertNotCancelled(options);
        return cleanupWarning !== undefined
            ? {code: "stakeengine-stale-export-cleanup-failed", severity: "warning", message: cleanupWarning, details: {outDir}}
            : undefined;
    }

    // Builds one mode's CSV/books content fully in memory (no disk access): projects every outcome's artifact
    // into Stake events (via the injected eventsProjector, given this mode's own cost as projection context),
    // checks the result is canonical-JSON-safe (rejecting NaN/Infinity/bigint/cycles/anything else that isn't
    // valid JSON — see toCanonicalJson — whether that garbage came from the standard projector or a custom one),
    // and converts each outcome's payoutMultiplier into Stake's integer unit convention. Any failure along the
    // way — a throwing projector, non-JSON-safe output — becomes a ValidationIssue rather than a crash; this
    // mode's own outcomes that already built fine are simply not returned (the exporter as a whole never writes
    // anything once any mode reports an error, see exportToDirectory).
    private async buildMode(
        mode: StakeEngineExportModeInput<T>,
        options: StakeEngineExportOptions | undefined,
        completedBefore: bigint,
    ): Promise<ModeBuildResult> {
        const issues: ValidationIssue[] = [];
        const bookLines: StakeEngineBookLine[] = [];
        const csvRows: {simulationId: number; weight: number; payoutMultiplier: number}[] = [];

        let processed = BigInt(0);
        for (const outcome of mode.library.outcomes) {
            assertNotCancelled(options);
            const id = parseStakeEngineOutcomeId(outcome.id);
            if (id === undefined) {
                // Unreachable once StakeEngineExportValidator has run without errors (it rejects any outcome id
                // that doesn't already parse this way) — guarded rather than cast, since buildMode has no way
                // to know validation actually ran.
                throw new StakeEngineExportInvariantError(`mode "${mode.modeName}": outcome id "${outcome.id}" is not a valid Stake Engine integer id.`);
            }

            let events: readonly StakeEngineEvent[];
            try {
                events = this.eventsProjector.project(outcome.artifact, {cost: mode.cost});
            } catch (error) {
                issues.push({
                    code: "stakeengine-outcome-events-invalid",
                    severity: "error",
                    message: `mode "${mode.modeName}": outcome "${outcome.id}": events projector failed: ${error instanceof Error ? error.message : String(error)}`,
                    details: {modeName: mode.modeName, id: outcome.id},
                });
                continue;
            }

            try {
                toCanonicalJson(events);
            } catch (error) {
                issues.push({
                    code: "stakeengine-outcome-events-not-json-safe",
                    severity: "error",
                    message: `mode "${mode.modeName}": outcome "${outcome.id}": events are not JSON-safe: ${error instanceof InvalidJsonValueError ? error.message : String(error)}`,
                    details: {modeName: mode.modeName, id: outcome.id},
                });
                continue;
            }

            const stakePayoutMultiplier = convertRatioToStakeUnits(outcome.artifact.payoutMultiplier, mode.cost);
            if (stakePayoutMultiplier === undefined) {
                // Unreachable once StakeEngineExportValidator has run without errors (it rejects exactly this
                // case) — guarded the same way as the id check above.
                throw new StakeEngineExportInvariantError(
                    `mode "${mode.modeName}": outcome "${outcome.id}"'s payoutMultiplier is not representable in Stake units.`,
                );
            }

            bookLines.push({id, events, payoutMultiplier: stakePayoutMultiplier});
            csvRows.push({simulationId: id, weight: outcome.weight, payoutMultiplier: stakePayoutMultiplier});
            processed++;
            options?.onProgress?.({completed: completedBefore + processed, message: `Building Stake mode ${mode.modeName}`});
            assertNotCancelled(options);
            if (processed % BigInt(256) === BigInt(0)) {
                await new Promise<void>((resolve) => {
                    setImmediate(resolve);
                });
            }
        }

        if (issues.length > 0) {
            return {issues, built: undefined};
        }

        const firstOutcome = mode.library.outcomes[0];
        const manifestEntry: StakeEngineManifestModeEntry = {
            name: mode.modeName,
            betMode: firstOutcome.artifact.betMode,
            stake: firstOutcome.artifact.stake,
            cost: mode.cost,
            outcomeCount: mode.library.outcomes.length,
            libraryId: mode.library.libraryId,
            libraryHash: computeWeightedOutcomeLibraryHash(mode.library),
            events: `books_${mode.modeName}.jsonl.zst`,
            weights: `lookup_${mode.modeName}.csv`,
            ...(mode.generator === undefined ? {} : {generator: mode.generator}),
        };

        return {
            issues: [],
            built: {
                csvFileName: manifestEntry.weights,
                booksFileName: manifestEntry.events,
                csvContent: renderStakeEngineLookupCsv(csvRows),
                booksBuffer: compressStakeEngineBooksJsonl(bookLines),
                manifestEntry,
            },
        };
    }
}

function assertNotCancelled(options: StakeEngineExportOptions | undefined): void {
    if (options?.signal?.aborted) throw new StakeEngineExportCancelledError();
}
