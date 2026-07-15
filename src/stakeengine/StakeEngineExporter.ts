import crypto from "crypto";
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
import {renderStakeEngineLookupCsv} from "./internal/renderStakeEngineLookupCsv.js";
import type {StakeEngineBookLine} from "./StakeEngineBookLine.js";
import type {StakeEngineEvent} from "./StakeEngineEvent.js";
import {StakeEngineExportInvariantError} from "./StakeEngineExportInvariantError.js";
import type {StakeEngineExportModeInput} from "./StakeEngineExportModeInput.js";
import type {StakeEngineExporting} from "./StakeEngineExporting.js";
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
// directory first, and only swapped into place (a directory rename, see swapDirectoryIntoPlace) once every file
// has been written successfully. A failure at any point before the swap — a validation error, a projector
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
    // Not "async": every step here is synchronous (fs.*Sync throughout, for the same reason
    // GamePackageGenerator's own generate() is fully synchronous — a Stake export is one-shot local disk I/O,
    // not concurrent/streamed). Still returns a Promise, and still turns a thrown error into a rejection rather
    // than a synchronous throw (see the catch below), so callers can `await`/`.catch()` it exactly like any
    // other exporter in this package.
    public exportToDirectory(modes: readonly StakeEngineExportModeInput<T>[], outDir: string): Promise<StakeEngineExportResult> {
        try {
            const structuralIssues = this.validator.validate(modes);
            if (structuralIssues.some((issue) => issue.severity === "error")) {
                return Promise.resolve({outDir, files: [], manifest: undefined, issues: structuralIssues});
            }

            const buildResults = modes.map((mode) => this.buildMode(mode));
            const allIssues = [...structuralIssues, ...buildResults.flatMap((result) => result.issues)];
            if (allIssues.some((issue) => issue.severity === "error")) {
                return Promise.resolve({outDir, files: [], manifest: undefined, issues: allIssues});
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
                modes: builtModes.map((builtMode) => builtMode.manifestEntry),
                files: relativeFiles,
            };

            assertSafeToReplaceStakeEngineExportDirectory(outDir);
            const cleanupWarning = this.writeToTempDirectoryThenSwap(outDir, builtModes, index, manifest);
            const finalIssues = cleanupWarning !== undefined ? [...allIssues, cleanupWarning] : allIssues;

            return Promise.resolve({outDir, files: relativeFiles, manifest, issues: finalIssues});
        } catch (error) {
            return Promise.reject(error);
        }
    }

    // Writes every file into a fresh temp sibling directory (never touching outDir itself), then swaps it into
    // place only once everything succeeded — see swapDirectoryIntoPlace. Any failure while writing removes the
    // temp directory (best-effort — see removeBestEffort) and rethrows, leaving outDir exactly as it was.
    // Returns a warning ValidationIssue when the export itself succeeded but a purely cosmetic post-publish
    // cleanup step failed (see swapDirectoryIntoPlace) — never thrown, since the export is already a success by
    // that point.
    private writeToTempDirectoryThenSwap(
        outDir: string,
        builtModes: readonly BuiltMode[],
        index: StakeEngineIndex,
        manifest: StakeEngineManifest,
    ): ValidationIssue | undefined {
        const tempDir = `${outDir}.tmp-${crypto.randomBytes(6).toString("hex")}`;
        try {
            fs.mkdirSync(tempDir, {recursive: true});
            for (const builtMode of builtModes) {
                this.writeFile(path.join(tempDir, builtMode.csvFileName), builtMode.csvContent);
                this.writeFile(path.join(tempDir, builtMode.booksFileName), builtMode.booksBuffer);
            }
            this.writeFile(path.join(tempDir, "index.json"), `${JSON.stringify(index, null, 4)}\n`);
            this.writeFile(path.join(tempDir, "pokie-manifest.json"), `${JSON.stringify(manifest, null, 4)}\n`);
        } catch (error) {
            this.removeBestEffort(tempDir);
            throw error;
        }

        return this.swapDirectoryIntoPlace(tempDir, outDir);
    }

    // Publishes a fully-built temp directory as outDir in as close to one atomic step as the filesystem allows:
    // if outDir doesn't exist yet, a single rename does it (any failure there just leaves outDir absent and
    // tempDir cleaned up — nothing was ever published). If outDir already exists (a re-export), the existing
    // directory is first renamed out of the way to a "stale" sibling path (itself a single atomic rename — from
    // that instant on, outDir simply doesn't exist for a moment, never a partially-updated one), then the temp
    // directory is renamed into outDir. A reader can therefore only ever observe the complete old directory or
    // the complete new one, never a mix of the two.
    //
    // Two distinct failure modes past that first "move the old directory aside" rename get different treatment:
    //   - the *publish* rename (tempDir -> outDir) failing is a real export failure — the new directory never
    //     went live, so the old one is restored to outDir (a third rename) before the error propagates, and the
    //     export is reported as failed. If that restore itself fails too (the one truly unrecoverable case),
    //     the thrown error says exactly where the old directory's contents still are so they can be restored by
    //     hand.
    //   - removing the now-superseded stale directory, *after* the new one is already live at outDir, is pure
    //     cleanup — the export already succeeded by that point, so a failure there is reported as a warning
    //     ValidationIssue instead of failing the whole export.
    private swapDirectoryIntoPlace(tempDir: string, outDir: string): ValidationIssue | undefined {
        if (!fs.existsSync(outDir)) {
            try {
                this.renameDirectory(tempDir, outDir);
            } catch (error) {
                this.removeBestEffort(tempDir);
                throw error;
            }
            return undefined;
        }

        const stalePath = `${outDir}.stale-${crypto.randomBytes(6).toString("hex")}`;
        try {
            this.renameDirectory(outDir, stalePath);
        } catch (error) {
            // outDir was never actually moved — nothing to restore, just clean up the orphaned temp directory.
            this.removeBestEffort(tempDir);
            throw error;
        }

        try {
            this.renameDirectory(tempDir, outDir);
        } catch (publishError) {
            try {
                this.renameDirectory(stalePath, outDir);
            } catch (restoreError) {
                // Neither the publish nor the rollback succeeded — the temp directory is done for (removed
                // best-effort, same as every other failure branch), but stalePath is deliberately left alone: it
                // still holds the previous export's contents, byte for byte, and is the only way to recover
                // manually (see the thrown error below).
                this.removeBestEffort(tempDir);
                throw new Error(
                    `Failed to publish the new Stake Engine export, and failed to restore the previous directory afterward: ` +
                        `${publishError instanceof Error ? publishError.message : String(publishError)}; restore failure: ` +
                        `${restoreError instanceof Error ? restoreError.message : String(restoreError)}. The previous directory's ` +
                        `contents are still intact at "${stalePath}" — rename it back to "${outDir}" by hand.`,
                );
            }
            this.removeBestEffort(tempDir);
            throw publishError;
        }

        try {
            this.removeDirectory(stalePath);
            return undefined;
        } catch (error) {
            return {
                code: "stakeengine-stale-export-cleanup-failed",
                severity: "warning",
                message:
                    `The export to "${outDir}" succeeded, but the previous directory's stale backup at "${stalePath}" could not be removed: ` +
                    `${error instanceof Error ? error.message : String(error)}. Remove it manually.`,
                details: {stalePath},
            };
        }
    }

    // Best-effort cleanup used only on already-failing paths: never lets a secondary cleanup failure mask or
    // replace the original error being thrown (see every call site above).
    private removeBestEffort(dirPath: string): void {
        try {
            this.removeDirectory(dirPath);
        } catch {
            // best-effort only.
        }
    }

    // Builds one mode's CSV/books content fully in memory (no disk access): projects every outcome's artifact
    // into Stake events (via the injected eventsProjector, given this mode's own cost as projection context),
    // checks the result is canonical-JSON-safe (rejecting NaN/Infinity/bigint/cycles/anything else that isn't
    // valid JSON — see toCanonicalJson — whether that garbage came from the standard projector or a custom one),
    // and converts each outcome's payoutMultiplier into Stake's integer unit convention. Any failure along the
    // way — a throwing projector, non-JSON-safe output — becomes a ValidationIssue rather than a crash; this
    // mode's own outcomes that already built fine are simply not returned (the exporter as a whole never writes
    // anything once any mode reports an error, see exportToDirectory).
    private buildMode(mode: StakeEngineExportModeInput<T>): ModeBuildResult {
        const issues: ValidationIssue[] = [];
        const bookLines: StakeEngineBookLine[] = [];
        const csvRows: {simulationId: number; weight: number; payoutMultiplier: number}[] = [];

        for (const outcome of mode.library.outcomes) {
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
