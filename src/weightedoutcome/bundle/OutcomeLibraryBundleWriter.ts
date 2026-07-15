import crypto from "crypto";
import fs from "fs";
import path from "path";
import {publishDirectoryAtomically} from "../../stakeengine/internal/publishDirectoryAtomically.js";
import type {ValidationIssue} from "../../validation/ValidationIssue.js";
import {WEIGHTED_OUTCOME_LIBRARY_SCHEMA_VERSION} from "../WeightedOutcomeLibrary.js";
import {computeOnlineWeightedOutcomeLibraryAnalysis} from "./internal/computeOnlineWeightedOutcomeLibraryAnalysis.js";
import {streamModeOutcomesToTempFile} from "./internal/streamModeOutcomesToTempFile.js";
import {OUTCOME_LIBRARY_BUNDLE_MANIFEST_SCHEMA_VERSION, type OutcomeLibraryBundleManifest, type OutcomeLibraryBundleManifestModeEntry} from "./OutcomeLibraryBundleManifest.js";
import {OUTCOME_LIBRARY_BUNDLE_MODE_INDEX_SCHEMA_VERSION, type OutcomeLibraryBundleModeIndex} from "./OutcomeLibraryBundleModeIndex.js";
import type {OutcomeLibraryBundleModeInput} from "./OutcomeLibraryBundleModeInput.js";
import type {OutcomeLibraryBundleWriteResult} from "./OutcomeLibraryBundleWriteResult.js";
import type {OutcomeLibraryBundleWriteValidating} from "./OutcomeLibraryBundleWriteValidating.js";
import {OutcomeLibraryBundleWriteValidator} from "./OutcomeLibraryBundleWriteValidator.js";
import type {OutcomeLibraryBundleWriting} from "./OutcomeLibraryBundleWriting.js";

// A single mode's provenance, read off its own first outcome — used to check every mode written into one
// bundle shares the same underlying game/config/pokieVersion (betMode/stake are expected to differ per mode).
// Mirrors StakeEngineExportValidator's own ModeProvenanceKey exactly. Only known once a mode's stream has
// actually started producing outcomes, so (unlike mode-name validation) this can't be checked upfront.
type ModeProvenanceKey = {
    readonly gameId: string;
    readonly gameVersion: string;
    readonly configHash: string | undefined;
    readonly pokieVersion: string;
};

function provenanceKeyOf(firstOutcome: {readonly artifact: {readonly provenance: {readonly game: {readonly id: string; readonly version: string}; readonly configHash?: string; readonly pokieVersion: string}}}): ModeProvenanceKey {
    return {
        gameId: firstOutcome.artifact.provenance.game.id,
        gameVersion: firstOutcome.artifact.provenance.game.version,
        configHash: firstOutcome.artifact.provenance.configHash,
        pokieVersion: firstOutcome.artifact.provenance.pokieVersion,
    };
}

// Persists one or more streaming outcome sources (one per mode) as the canonical POKIE outcome-library bundle:
// a small manifest.json, one small index_<modeName>.json per mode, and one streaming outcomes_<modeName>.jsonl
// per mode. This is the ONE writer both the pre-generated runtime and the Stake Engine exporter's own loaded
// data ultimately trace back to (see loadWeightedOutcomeLibraryFromBundle) — never a second calculation path:
// every hash/metric/outcome written here is derived directly from the outcomes the caller streams in, by the
// same logic (see streamModeOutcomesToTempFile/computeOnlineWeightedOutcomeLibraryAnalysis) used everywhere a
// WeightedOutcomeLibrary is built/analyzed elsewhere in this codebase.
//
// End-to-end streaming: each mode's "outcomes" (an Iterable or AsyncIterable — see OutcomeLibraryBundleModeInput)
// is consumed exactly once, one outcome at a time, validated and written to disk as it arrives — this class
// never builds an in-memory array of a mode's outcomes, however many there are. Because publishDirectoryAtomically
// (the atomic swap this writer shares with StakeEngineImportWriter) needs a *synchronous* callback to populate
// its own temp directory, the actual (necessarily async) streaming work happens first, into a separate staging
// directory this class manages itself; publishing then becomes a purely synchronous rename of each already-
// written file from staging into publishDirectoryAtomically's own temp dir — so the atomic-publish contract
// itself is reused unmodified, never touched or forked. The staging directory is removed (best-effort) whether
// the write succeeds or fails — on success it's already empty (every file was renamed out of it); on failure,
// whatever was staged is simply discarded and an existing outDir is left completely untouched, the same
// no-partial-bundle guarantee as before.
//
// This is genuinely "async" (unlike StakeEngineExporter/the previous version of this class) rather than "returns
// a Promise but every step is synchronous fs work" — consuming an arbitrary caller-supplied AsyncIterable is real
// asynchronous work, not just an interface-consistency wrapper.
export class OutcomeLibraryBundleWriter<T extends string | number = string> implements OutcomeLibraryBundleWriting<T> {
    private readonly pokieVersion: string;
    private readonly validator: OutcomeLibraryBundleWriteValidating<T>;
    private readonly now: () => Date;
    private readonly writeFile: (filePath: string, contents: string) => void;
    private readonly renameDirectory: (from: string, to: string) => void;
    private readonly removeDirectory: (dirPath: string) => void;

    constructor(
        pokieVersion: string,
        validator: OutcomeLibraryBundleWriteValidating<T> = new OutcomeLibraryBundleWriteValidator<T>(),
        now: () => Date = () => new Date(),
        writeFile: (filePath: string, contents: string) => void = (filePath, contents) => fs.writeFileSync(filePath, contents, "utf-8"),
        renameDirectory: (from: string, to: string) => void = (from, to) => fs.renameSync(from, to),
        removeDirectory: (dirPath: string) => void = (dirPath) => fs.rmSync(dirPath, {recursive: true, force: true}),
    ) {
        this.pokieVersion = pokieVersion;
        this.validator = validator;
        this.now = now;
        this.writeFile = writeFile;
        this.renameDirectory = renameDirectory;
        this.removeDirectory = removeDirectory;
    }

    public async writeToDirectory(modes: readonly OutcomeLibraryBundleModeInput<T>[], outDir: string): Promise<OutcomeLibraryBundleWriteResult> {
        const upfrontIssues = this.validator.validate(modes);
        if (upfrontIssues.some((issue) => issue.severity === "error")) {
            return {outDir, files: [], manifest: undefined, issues: upfrontIssues};
        }

        const stagingDir = `${outDir}.staging-${crypto.randomBytes(6).toString("hex")}`;
        fs.mkdirSync(stagingDir, {recursive: true});
        try {
            const issues: ValidationIssue[] = [...upfrontIssues];
            const manifestEntries: OutcomeLibraryBundleManifestModeEntry[] = [];
            let firstMode: {readonly provenanceKey: ModeProvenanceKey; readonly firstOutcome: unknown} | undefined;
            let gameManifest: OutcomeLibraryBundleManifest["game"] | undefined;
            let configHash: string | undefined;
            let artifactPokieVersion: string | undefined;

            for (const mode of modes) {
                const schemaVersion = mode.schemaVersion ?? WEIGHTED_OUTCOME_LIBRARY_SCHEMA_VERSION;
                if (schemaVersion !== WEIGHTED_OUTCOME_LIBRARY_SCHEMA_VERSION) {
                    issues.push({
                        code: "outcome-library-bundle-write-schema-version-invalid",
                        severity: "error",
                        message: `mode "${mode.modeName}": schemaVersion must be the current supported version (${WEIGHTED_OUTCOME_LIBRARY_SCHEMA_VERSION}), got ${String(schemaVersion)}.`,
                        details: {modeName: mode.modeName},
                    });
                    continue;
                }

                const outcomesFile = `outcomes_${mode.modeName}.jsonl`;
                const outcomesPath = path.join(stagingDir, outcomesFile);
                const result = await streamModeOutcomesToTempFile(mode.modeName, mode.libraryId, mode.outcomes, schemaVersion, outcomesPath);
                issues.push(...result.issues);
                if (result.built === undefined) {
                    continue;
                }

                const current = provenanceKeyOf(result.built.firstOutcome as never);
                if (firstMode === undefined) {
                    firstMode = {provenanceKey: current, firstOutcome: result.built.firstOutcome};
                    gameManifest = (result.built.firstOutcome as {artifact: {provenance: {game: OutcomeLibraryBundleManifest["game"]}}}).artifact.provenance.game;
                    configHash = (result.built.firstOutcome as {artifact: {provenance: {configHash?: string}}}).artifact.provenance.configHash;
                    artifactPokieVersion = current.pokieVersion;
                } else if (
                    current.gameId !== firstMode.provenanceKey.gameId ||
                    current.gameVersion !== firstMode.provenanceKey.gameVersion ||
                    current.configHash !== firstMode.provenanceKey.configHash ||
                    current.pokieVersion !== firstMode.provenanceKey.pokieVersion
                ) {
                    issues.push({
                        code: "outcome-library-bundle-cross-mode-provenance-mismatch",
                        severity: "error",
                        message: `mode "${mode.modeName}" has different provenance (game id/version, configHash, or pokieVersion) than the bundle's other modes.`,
                        details: {modeName: mode.modeName},
                    });
                    continue;
                }

                const analysis = await computeOnlineWeightedOutcomeLibraryAnalysis(outcomesPath, result.built.totalWeight);
                const indexFile = `index_${mode.modeName}.json`;
                const firstOutcome = result.built.firstOutcome as {artifact: {betMode: string; stake: number}};

                const manifestEntry: OutcomeLibraryBundleManifestModeEntry = {
                    modeName: mode.modeName,
                    betMode: firstOutcome.artifact.betMode,
                    stake: firstOutcome.artifact.stake,
                    libraryId: mode.libraryId,
                    libraryHash: result.built.libraryHash,
                    outcomeCount: result.built.entries.length,
                    totalWeight: result.built.totalWeight,
                    analysis,
                    indexFile,
                    outcomesFile,
                };
                manifestEntries.push(manifestEntry);

                const index: OutcomeLibraryBundleModeIndex = {
                    schemaVersion: OUTCOME_LIBRARY_BUNDLE_MODE_INDEX_SCHEMA_VERSION,
                    modeName: mode.modeName,
                    libraryId: mode.libraryId,
                    librarySchemaVersion: schemaVersion,
                    libraryHash: result.built.libraryHash,
                    outcomeCount: result.built.entries.length,
                    totalWeight: result.built.totalWeight,
                    outcomesFile,
                    entries: result.built.entries,
                };
                this.writeFile(path.join(stagingDir, indexFile), `${JSON.stringify(index, null, 4)}\n`);
            }

            if (issues.some((issue) => issue.severity === "error") || gameManifest === undefined || artifactPokieVersion === undefined) {
                return {outDir, files: [], manifest: undefined, issues};
            }

            const relativeFiles = [...manifestEntries.flatMap((entry) => [entry.indexFile, entry.outcomesFile]), "manifest.json"];
            const manifest: OutcomeLibraryBundleManifest = {
                schemaVersion: OUTCOME_LIBRARY_BUNDLE_MANIFEST_SCHEMA_VERSION,
                generatedBy: "pokie outcomelibrary build",
                pokieVersion: this.pokieVersion,
                generatedAt: this.now().toISOString(),
                game: gameManifest,
                ...(configHash !== undefined ? {configHash} : {}),
                artifactPokieVersion,
                modes: manifestEntries,
                files: relativeFiles,
            };
            this.writeFile(path.join(stagingDir, "manifest.json"), `${JSON.stringify(manifest, null, 4)}\n`);

            const {cleanupWarning} = publishDirectoryAtomically({
                outDir,
                renameDirectory: this.renameDirectory,
                removeDirectory: this.removeDirectory,
                writeFilesIntoTempDir: (tempDir) => {
                    for (const file of relativeFiles) {
                        this.renameDirectory(path.join(stagingDir, file), path.join(tempDir, file));
                    }
                },
            });

            const finalIssues =
                cleanupWarning !== undefined
                    ? [...issues, {code: "outcome-library-bundle-write-stale-cleanup-failed", severity: "warning" as const, message: cleanupWarning, details: {outDir}}]
                    : issues;

            return {outDir, files: relativeFiles, manifest, issues: finalIssues};
        } finally {
            try {
                this.removeDirectory(stagingDir);
            } catch {
                // best-effort only — the staging directory is purely internal scratch space, never part of the
                // published result either way.
            }
        }
    }
}
