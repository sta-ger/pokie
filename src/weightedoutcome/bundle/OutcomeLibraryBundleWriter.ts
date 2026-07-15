import fs from "fs";
import path from "path";
import type {ValidationIssue} from "../../validation/ValidationIssue.js";
import {publishDirectoryAtomically} from "../../stakeengine/internal/publishDirectoryAtomically.js";
import {computeWeightedOutcomeLibraryHash} from "../computeWeightedOutcomeLibraryHash.js";
import type {WeightedOutcome} from "../WeightedOutcome.js";
import {WeightedOutcomeLibraryAnalyzer} from "../WeightedOutcomeLibraryAnalyzer.js";
import {writeOutcomesJsonl} from "./internal/writeOutcomesJsonl.js";
import {OUTCOME_LIBRARY_BUNDLE_MANIFEST_SCHEMA_VERSION, type OutcomeLibraryBundleManifest, type OutcomeLibraryBundleManifestModeEntry} from "./OutcomeLibraryBundleManifest.js";
import {OUTCOME_LIBRARY_BUNDLE_MODE_INDEX_SCHEMA_VERSION, type OutcomeLibraryBundleIndexEntry, type OutcomeLibraryBundleModeIndex} from "./OutcomeLibraryBundleModeIndex.js";
import type {OutcomeLibraryBundleModeInput} from "./OutcomeLibraryBundleModeInput.js";
import {OutcomeLibraryBundleInvariantError} from "./OutcomeLibraryBundleInvariantError.js";
import type {OutcomeLibraryBundleWriteResult} from "./OutcomeLibraryBundleWriteResult.js";
import type {OutcomeLibraryBundleWriteValidating} from "./OutcomeLibraryBundleWriteValidating.js";
import {OutcomeLibraryBundleWriteValidator} from "./OutcomeLibraryBundleWriteValidator.js";
import type {OutcomeLibraryBundleWriting} from "./OutcomeLibraryBundleWriting.js";

type BuiltMode<T extends string | number = string> = {
    readonly modeName: string;
    readonly outcomes: readonly WeightedOutcome<T>[];
    readonly librarySchemaVersion: number;
    readonly manifestEntry: OutcomeLibraryBundleManifestModeEntry;
};

// Persists one or more WeightedOutcomeLibrary instances (one per mode) as the canonical POKIE outcome-library
// bundle: a small manifest.json, one small index_<modeName>.json per mode, and one streaming
// outcomes_<modeName>.jsonl per mode. This is the ONE writer both the pre-generated runtime and the Stake
// Engine exporter's own loaded data ultimately trace back to (see loadWeightedOutcomeLibraryFromBundle) — never
// a second calculation path: every hash/metric/outcome written here already exists on the library's own
// outcomes/artifacts, computed by the same functions (computeWeightedOutcomeLibraryHash,
// WeightedOutcomeLibraryAnalyzer) used everywhere else in this codebase.
//
// The whole output directory is replaced atomically via the shared publishDirectoryAtomically (also used by
// StakeEngineImportWriter) — everything is built into a fresh temporary sibling directory first, and only
// swapped into place once every file has been written successfully. A failure at any point before the swap
// leaves an existing outDir completely untouched; a re-write into the same outDir starts from nothing, so a
// mode that no longer appears in this run never leaves its old index/outcomes files behind.
//
// Each mode's outcomes are streamed to disk one canonical-JSON line at a time (see internal/writeOutcomesJsonl)
// — never buffered as one giant string, however many outcomes a mode has.
export class OutcomeLibraryBundleWriter<T extends string | number = string> implements OutcomeLibraryBundleWriting<T> {
    private readonly pokieVersion: string;
    private readonly validator: OutcomeLibraryBundleWriteValidating<T>;
    private readonly now: () => Date;
    private readonly writeFile: (filePath: string, contents: string) => void;
    private readonly renameDirectory: (from: string, to: string) => void;
    private readonly removeDirectory: (dirPath: string) => void;
    private readonly writeOutcomes: (filePath: string, outcomes: readonly WeightedOutcome<T>[]) => readonly OutcomeLibraryBundleIndexEntry[];

    constructor(
        pokieVersion: string,
        validator: OutcomeLibraryBundleWriteValidating<T> = new OutcomeLibraryBundleWriteValidator<T>(),
        now: () => Date = () => new Date(),
        writeFile: (filePath: string, contents: string) => void = (filePath, contents) => fs.writeFileSync(filePath, contents, "utf-8"),
        renameDirectory: (from: string, to: string) => void = (from, to) => fs.renameSync(from, to),
        removeDirectory: (dirPath: string) => void = (dirPath) => fs.rmSync(dirPath, {recursive: true, force: true}),
        writeOutcomes: (filePath: string, outcomes: readonly WeightedOutcome<T>[]) => readonly OutcomeLibraryBundleIndexEntry[] = writeOutcomesJsonl,
    ) {
        this.pokieVersion = pokieVersion;
        this.validator = validator;
        this.now = now;
        this.writeFile = writeFile;
        this.renameDirectory = renameDirectory;
        this.removeDirectory = removeDirectory;
        this.writeOutcomes = writeOutcomes;
    }

    // Not "async" — same reasoning as StakeEngineExporter/StakeEngineImportWriter: synchronous fs work
    // throughout (publishDirectoryAtomically's own contract), still returns a Promise, still rejects rather than
    // throws synchronously.
    public writeToDirectory(modes: readonly OutcomeLibraryBundleModeInput<T>[], outDir: string): Promise<OutcomeLibraryBundleWriteResult> {
        try {
            const structuralIssues = this.validator.validate(modes);
            if (structuralIssues.some((issue) => issue.severity === "error")) {
                return Promise.resolve({outDir, files: [], manifest: undefined, issues: structuralIssues});
            }

            const builtModes = modes.map((mode) => this.buildMode(mode));

            const relativeFiles = [...builtModes.flatMap((built) => [built.manifestEntry.indexFile, built.manifestEntry.outcomesFile]), "manifest.json"];

            const firstOutcome = modes[0].library.outcomes[0];
            const manifest: OutcomeLibraryBundleManifest = {
                schemaVersion: OUTCOME_LIBRARY_BUNDLE_MANIFEST_SCHEMA_VERSION,
                generatedBy: "pokie outcomelibrary build",
                pokieVersion: this.pokieVersion,
                generatedAt: this.now().toISOString(),
                game: firstOutcome.artifact.provenance.game,
                ...(firstOutcome.artifact.provenance.configHash !== undefined ? {configHash: firstOutcome.artifact.provenance.configHash} : {}),
                modes: builtModes.map((built) => built.manifestEntry),
                files: relativeFiles,
            };

            const {cleanupWarning} = publishDirectoryAtomically({
                outDir,
                renameDirectory: this.renameDirectory,
                removeDirectory: this.removeDirectory,
                writeFilesIntoTempDir: (tempDir) => this.writeModesIntoTempDir(tempDir, builtModes, manifest),
            });

            const issues: ValidationIssue[] =
                cleanupWarning !== undefined
                    ? [{code: "outcome-library-bundle-write-stale-cleanup-failed", severity: "warning", message: cleanupWarning, details: {outDir}}]
                    : [];

            return Promise.resolve({outDir, files: relativeFiles, manifest, issues});
        } catch (error) {
            return Promise.reject(error);
        }
    }

    // Builds one mode's manifest entry fully in memory (no disk access): computes the same hash/analysis every
    // other reader of this library would compute — never a second, differently-derived value.
    private buildMode(mode: OutcomeLibraryBundleModeInput<T>): BuiltMode<T> {
        const firstOutcome = mode.library.outcomes[0];
        if (firstOutcome === undefined) {
            // Unreachable: WeightedOutcomeLibraryValidator (always run by OutcomeLibraryBundleWriteValidator
            // above) already rejects an empty outcomes array.
            throw new OutcomeLibraryBundleInvariantError(`mode "${mode.modeName}": library has no outcomes after successful validation.`);
        }

        const analysis = new WeightedOutcomeLibraryAnalyzer<T>().analyze(mode.library);
        const libraryHash = computeWeightedOutcomeLibraryHash(mode.library);
        const indexFile = `index_${mode.modeName}.json`;
        const outcomesFile = `outcomes_${mode.modeName}.jsonl`;

        return {
            modeName: mode.modeName,
            outcomes: mode.library.outcomes,
            librarySchemaVersion: mode.library.schemaVersion,
            manifestEntry: {
                modeName: mode.modeName,
                betMode: firstOutcome.artifact.betMode,
                stake: firstOutcome.artifact.stake,
                libraryId: mode.library.libraryId,
                libraryHash,
                outcomeCount: mode.library.outcomes.length,
                totalWeight: analysis.totalWeight,
                analysis,
                indexFile,
                outcomesFile,
            },
        };
    }

    private writeModesIntoTempDir(tempDir: string, builtModes: readonly BuiltMode<T>[], manifest: OutcomeLibraryBundleManifest): void {
        for (const built of builtModes) {
            const entries = this.writeOutcomes(path.join(tempDir, built.manifestEntry.outcomesFile), built.outcomes);
            const index: OutcomeLibraryBundleModeIndex = {
                schemaVersion: OUTCOME_LIBRARY_BUNDLE_MODE_INDEX_SCHEMA_VERSION,
                modeName: built.modeName,
                libraryId: built.manifestEntry.libraryId,
                librarySchemaVersion: built.librarySchemaVersion,
                libraryHash: built.manifestEntry.libraryHash,
                outcomeCount: built.manifestEntry.outcomeCount,
                totalWeight: built.manifestEntry.totalWeight,
                outcomesFile: built.manifestEntry.outcomesFile,
                entries,
            };
            this.writeFile(path.join(tempDir, built.manifestEntry.indexFile), `${JSON.stringify(index, null, 4)}\n`);
        }
        this.writeFile(path.join(tempDir, "manifest.json"), `${JSON.stringify(manifest, null, 4)}\n`);
    }
}
