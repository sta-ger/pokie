import crypto from "crypto";
import fs from "fs";
import path from "path";
import {computeRoundArtifactHash} from "../artifact/computeRoundArtifactHash.js";
import {toCanonicalJson} from "../json/toCanonicalJson.js";
import {SeededWeightedOutcomeRandomSource} from "../pregenerated/SeededWeightedOutcomeRandomSource.js";
import type {WeightedOutcomeRandomSource} from "../pregenerated/WeightedOutcomeRandomSource.js";
import {publishDirectoryAtomically} from "../stakeengine/internal/publishDirectoryAtomically.js";
import type {ValidationIssue} from "../validation/ValidationIssue.js";
import type {OutcomeLibraryBundleManifest, OutcomeLibraryBundleManifestModeEntry} from "../weightedoutcome/bundle/OutcomeLibraryBundleManifest.js";
import type {OutcomeLibraryBundleModeIndex} from "../weightedoutcome/bundle/OutcomeLibraryBundleModeIndex.js";
import {OutcomeLibraryBundleReader} from "../weightedoutcome/bundle/OutcomeLibraryBundleReader.js";
import type {OutcomeLibraryBundleReading} from "../weightedoutcome/bundle/OutcomeLibraryBundleReading.js";
import {OutcomeLibraryBundleValidator} from "../weightedoutcome/bundle/OutcomeLibraryBundleValidator.js";
import type {OutcomeLibraryBundleValidating} from "../weightedoutcome/bundle/OutcomeLibraryBundleValidating.js";
import {readAndVerifyOutcomeAtByteRange} from "../weightedoutcome/bundle/internal/readOutcomeAtByteRange.js";
import {selectIndexEntryByCumulativeWeight} from "../weightedoutcome/bundle/internal/selectIndexEntryByCumulativeWeight.js";
import {computeCertificationEvidenceContentHash} from "./computeCertificationEvidenceContentHash.js";
import {
    CERTIFICATION_EVIDENCE_BUNDLE_MANIFEST_SCHEMA_VERSION,
    type CertificationEvidenceBundleManifest,
    type CertificationEvidenceBundleModeEntry,
} from "./CertificationEvidenceBundleManifest.js";
import type {CertificationEvidenceBundleBuildResult} from "./CertificationEvidenceBundleBuildResult.js";
import type {CertificationEvidenceBundleBuilding} from "./CertificationEvidenceBundleBuilding.js";
import type {CertificationEvidenceBundleModeSampleInput} from "./CertificationEvidenceBundleModeSampleInput.js";
import {CertificationEvidenceBundleValidator} from "./CertificationEvidenceBundleValidator.js";
import type {CertificationEvidenceBundleValidating} from "./CertificationEvidenceBundleValidating.js";
import type {CertificationEvidenceSampleRecord} from "./CertificationEvidenceSampleRecord.js";
import {isPositiveSafeInteger, MODE_NAME_PATTERN} from "./internal/certificationEvidenceBundleShapeGuards.js";
import {sha256OfBytes} from "./internal/sha256OfBytes.js";

function hashManifest(manifest: OutcomeLibraryBundleManifest): string {
    return sha256OfBytes(JSON.stringify(toCanonicalJson(manifest)));
}

// The exact hash of a whole mode index, not just its own libraryHash field — closes a gap a libraryHash-only
// comparison would leave open: libraryHash is itself just one field *inside* the index, so a hand-tampered index
// file could have its entries (byteOffset/byteLength/recordHash, even their order) rewritten while the
// libraryHash *string* is left untouched. Hashing the whole object makes that indistinguishable from any other
// content change.
function hashIndex(index: OutcomeLibraryBundleModeIndex): string {
    return sha256OfBytes(JSON.stringify(toCanonicalJson(index)));
}

// Builds a canonical POKIE certification/evidence bundle *on top of* an already-built, already-valid Outcome
// Library Bundle — deliberately never a second calculation path: every hash/metric this writes is either read
// verbatim off the source bundle's own manifest.json (libraryHash/outcomeCount/totalWeight/analysis), or
// produced by selecting and reading samples directly against one pinned-in-memory snapshot of a mode's own
// index (see "Pinned-snapshot sampling" below) — the exact same selection/verification algorithms the
// pre-generated runtime and OutcomeLibraryBundleReader themselves use, just invoked directly against a snapshot
// this class captured itself, rather than through a wrapper that would re-read the index on every call. Refuses
// to write anything (the same "no partial artifact" guarantee OutcomeLibraryBundleWriter and StakeEngineExporter
// already carry) if the source bundle itself doesn't deep-validate cleanly — evidence built on top of a library
// that doesn't even validate against its own rules can't be trusted either.
//
// Pinned-snapshot sampling: each requested mode's own index is read exactly ONCE, before any sampling begins,
// and held in memory for the rest of the build — every one of that mode's sampleCount draws selects an entry
// (via selectIndexEntryByCumulativeWeight, the exact same cumulative-weight walk OutcomeLibraryBundleReader.
// drawOutcome uses internally) against that SAME captured OutcomeLibraryBundleModeIndex object, then reads and
// verifies that exact entry's own byte range (via readAndVerifyOutcomeAtByteRange, the same byte-range read +
// recordHash check readOutcomeById/drawOutcome themselves rely on) directly — never through drawOutcome, which
// would re-read a fresh index on every single call and could therefore observe a different snapshot mid-mode.
//
// Snapshot consistency: the source bundle's own manifest and each sampled mode's own index are hashed *exactly*
// (the whole object, not just one field) once, before any sampling begins, and re-read and compared again right
// before publishing — a bundle directory is plain files on disk, not a transaction, so this before/after
// comparison is the compensating control against the source bundle being rebuilt or otherwise mutated while
// sampling was in progress. Any drift detected there aborts the whole build (nothing is written), the same way
// a deep-validation error does.
//
// Publish-time self-check: immediately before publishing, the fully-assembled staging directory is itself
// validated via CertificationEvidenceBundleValidating — an internal inconsistency there (a bug in this class
// producing a manifest that doesn't hash to its own evidenceContentHash, say) aborts the publish exactly like
// any other error, rather than ever making a broken bundle visible at outDir.
export class CertificationEvidenceBundleBuilder<T extends string | number = string> implements CertificationEvidenceBundleBuilding {
    private readonly pokieVersion: string;
    private readonly reader: OutcomeLibraryBundleReading<T>;
    private readonly bundleValidator: OutcomeLibraryBundleValidating;
    private readonly randomSourceFactory: (seed: string) => WeightedOutcomeRandomSource;
    private readonly now: () => Date;
    private readonly writeFile: (filePath: string, contents: string | Buffer) => void;
    private readonly readFileBytes: (filePath: string) => Buffer;
    private readonly renameDirectory: (from: string, to: string) => void;
    private readonly removeDirectory: (dirPath: string) => void;
    private readonly selfValidator: CertificationEvidenceBundleValidating;

    constructor(
        pokieVersion: string,
        reader: OutcomeLibraryBundleReading<T> = new OutcomeLibraryBundleReader<T>(),
        bundleValidator: OutcomeLibraryBundleValidating = new OutcomeLibraryBundleValidator(),
        randomSourceFactory: (seed: string) => WeightedOutcomeRandomSource = (seed) => new SeededWeightedOutcomeRandomSource(seed),
        now: () => Date = () => new Date(),
        writeFile: (filePath: string, contents: string | Buffer) => void = (filePath, contents) => fs.writeFileSync(filePath, contents),
        readFileBytes: (filePath: string) => Buffer = (filePath) => fs.readFileSync(filePath),
        renameDirectory: (from: string, to: string) => void = (from, to) => fs.renameSync(from, to),
        removeDirectory: (dirPath: string) => void = (dirPath) => fs.rmSync(dirPath, {recursive: true, force: true}),
        // Appended last (rather than grouped next to bundleValidator) so existing positional constructor calls
        // never shift — see every other constructor parameter above.
        selfValidator: CertificationEvidenceBundleValidating = new CertificationEvidenceBundleValidator(),
    ) {
        this.pokieVersion = pokieVersion;
        this.reader = reader;
        this.bundleValidator = bundleValidator;
        this.randomSourceFactory = randomSourceFactory;
        this.now = now;
        this.writeFile = writeFile;
        this.readFileBytes = readFileBytes;
        this.renameDirectory = renameDirectory;
        this.removeDirectory = removeDirectory;
        this.selfValidator = selfValidator;
    }

    public async buildFromBundle(
        bundleDir: string,
        modes: readonly CertificationEvidenceBundleModeSampleInput[],
        outDir: string,
    ): Promise<CertificationEvidenceBundleBuildResult> {
        const upfrontIssues = this.validateModesInput(modes);
        if (upfrontIssues.some((issue) => issue.severity === "error")) {
            return {outDir, files: [], manifest: undefined, issues: upfrontIssues};
        }

        let sourceManifest: OutcomeLibraryBundleManifest;
        try {
            sourceManifest = await this.reader.readManifest(bundleDir);
        } catch (error) {
            return this.failed(outDir, upfrontIssues, [
                {
                    code: "certification-evidence-build-source-bundle-manifest-unreadable",
                    severity: "error",
                    message: `Could not read "${bundleDir}"'s own manifest.json: ${error instanceof Error ? error.message : String(error)}.`,
                },
            ]);
        }
        const initialManifestHash = hashManifest(sourceManifest);

        const deepValidationIssues = await this.bundleValidator.validate(bundleDir, {deep: true});
        if (deepValidationIssues.some((issue) => issue.severity === "error")) {
            return this.failed(outDir, upfrontIssues, deepValidationIssues);
        }

        const missingModeIssues: ValidationIssue[] = [];
        for (const modeInput of modes) {
            if (sourceManifest.modes.every((entry) => entry.modeName !== modeInput.modeName)) {
                missingModeIssues.push({
                    code: "certification-evidence-build-mode-not-found-in-bundle",
                    severity: "error",
                    message: `mode "${modeInput.modeName}" is not present in "${bundleDir}"'s own manifest.json.`,
                    details: {modeName: modeInput.modeName},
                });
            }
        }
        if (missingModeIssues.length > 0) {
            return this.failed(outDir, upfrontIssues, [...deepValidationIssues, ...missingModeIssues]);
        }

        // Snapshot capture: each requested mode's own index, read exactly once, before any sampling begins —
        // every draw for that mode selects/reads against this same in-memory object (see sampleMode), and its
        // exact hash (not just its own libraryHash field) is re-checked once more right before publishing (see
        // detectSourceBundleDrift).
        let initialIndexes: Map<string, OutcomeLibraryBundleModeIndex>;
        try {
            initialIndexes = await this.readModeIndexes(bundleDir, modes);
        } catch (error) {
            return this.failed(outDir, upfrontIssues, [
                ...deepValidationIssues,
                {
                    code: "certification-evidence-build-source-bundle-index-unreadable",
                    severity: "error",
                    message: `Could not read a requested mode's own index in "${bundleDir}": ${error instanceof Error ? error.message : String(error)}.`,
                },
            ]);
        }

        const stagingDir = `${outDir}.staging-${crypto.randomBytes(6).toString("hex")}`;
        fs.mkdirSync(stagingDir, {recursive: true});
        try {
            const modeEntries: CertificationEvidenceBundleModeEntry[] = [];
            for (const modeInput of modes) {
                // Safe: checked to exist against sourceManifest.modes above.
                const sourceEntry = sourceManifest.modes.find((entry) => entry.modeName === modeInput.modeName)!;
                // Safe: captured for every requested mode in readModeIndexes above.
                const capturedIndex = initialIndexes.get(modeInput.modeName)!;
                modeEntries.push(this.sampleMode(bundleDir, modeInput, sourceEntry, capturedIndex, stagingDir));
            }

            const driftIssue = await this.detectSourceBundleDrift(bundleDir, modes, initialManifestHash, initialIndexes);
            if (driftIssue !== undefined) {
                return this.failed(outDir, upfrontIssues, [...deepValidationIssues, driftIssue]);
            }

            const relativeFiles = [...modeEntries.map((entry) => entry.samplesFile), "manifest.json"];
            const generatedAt = this.now().toISOString();

            const draftManifest = {
                schemaVersion: CERTIFICATION_EVIDENCE_BUNDLE_MANIFEST_SCHEMA_VERSION,
                generatedBy: "pokie certification build",
                pokieVersion: this.pokieVersion,
                game: sourceManifest.game,
                ...(sourceManifest.configHash !== undefined ? {configHash: sourceManifest.configHash} : {}),
                artifactPokieVersion: sourceManifest.artifactPokieVersion,
                sourceBundleManifestHash: initialManifestHash,
                modes: modeEntries,
                deepValidation: {ranAt: generatedAt, issues: deepValidationIssues},
                files: relativeFiles,
            };
            const manifest: CertificationEvidenceBundleManifest = {
                ...draftManifest,
                generatedAt,
                sourceBundleDir: bundleDir,
                evidenceContentHash: computeCertificationEvidenceContentHash(draftManifest),
            };
            this.writeFile(path.join(stagingDir, "manifest.json"), `${JSON.stringify(manifest, null, 4)}\n`);

            // Publish-time self-check: validates the fully-assembled staging directory exactly the way any
            // other consumer would validate a published bundle — an internal inconsistency here is a bug in
            // this class, not a caller error, but it must never make it to outDir either way.
            const stagingIssues = await this.selfValidator.validate(stagingDir);
            if (stagingIssues.some((issue) => issue.severity === "error")) {
                return this.failed(outDir, upfrontIssues, [...deepValidationIssues, ...stagingIssues]);
            }

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

            const finalIssues = [...upfrontIssues, ...deepValidationIssues];
            if (cleanupWarning !== undefined) {
                finalIssues.push({code: "certification-evidence-build-stale-cleanup-failed", severity: "warning", message: cleanupWarning, details: {outDir}});
            }

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

    // outDir is never created/touched for any of these failure paths — every one of them returns before
    // publishDirectoryAtomically is ever called.
    private failed(outDir: string, upfrontIssues: readonly ValidationIssue[], rest: readonly ValidationIssue[]): CertificationEvidenceBundleBuildResult {
        return {outDir, files: [], manifest: undefined, issues: [...upfrontIssues, ...rest]};
    }

    private async readModeIndexes(
        bundleDir: string,
        modes: readonly CertificationEvidenceBundleModeSampleInput[],
    ): Promise<Map<string, OutcomeLibraryBundleModeIndex>> {
        const indexes = new Map<string, OutcomeLibraryBundleModeIndex>();
        for (const modeInput of modes) {
            indexes.set(modeInput.modeName, await this.reader.readModeIndex(bundleDir, modeInput.modeName));
        }
        return indexes;
    }

    // Re-reads the source bundle's own manifest and each sampled mode's own index, comparing the exact hash of
    // each against the snapshot captured before sampling began — never just one field (like libraryHash) picked
    // out of the index, which a hand-tampered index (entries reordered/rewritten, its libraryHash field left
    // stale) could otherwise slip past. Returns the drift ValidationIssue if anything differs, or a read itself
    // fails (the source bundle disappearing mid-sample is drift too), or undefined if the snapshot held.
    private async detectSourceBundleDrift(
        bundleDir: string,
        modes: readonly CertificationEvidenceBundleModeSampleInput[],
        initialManifestHash: string,
        initialIndexes: ReadonlyMap<string, OutcomeLibraryBundleModeIndex>,
    ): Promise<ValidationIssue | undefined> {
        let finalManifest: OutcomeLibraryBundleManifest;
        try {
            finalManifest = await this.reader.readManifest(bundleDir);
        } catch (error) {
            return {
                code: "certification-evidence-build-source-bundle-drift",
                severity: "error",
                message: `the source bundle at "${bundleDir}" could no longer be read after sampling (${error instanceof Error ? error.message : String(error)}); refusing to publish evidence against a possibly-inconsistent snapshot.`,
            };
        }
        if (hashManifest(finalManifest) !== initialManifestHash) {
            return {
                code: "certification-evidence-build-source-bundle-drift",
                severity: "error",
                message: `the source bundle's own manifest.json at "${bundleDir}" changed while evidence was being sampled; refusing to publish evidence against an inconsistent snapshot.`,
            };
        }

        for (const modeInput of modes) {
            let finalIndex: OutcomeLibraryBundleModeIndex;
            try {
                finalIndex = await this.reader.readModeIndex(bundleDir, modeInput.modeName);
            } catch (error) {
                return {
                    code: "certification-evidence-build-source-bundle-drift",
                    severity: "error",
                    message: `mode "${modeInput.modeName}"'s own index in "${bundleDir}" could no longer be read after sampling (${error instanceof Error ? error.message : String(error)}); refusing to publish evidence against a possibly-inconsistent snapshot.`,
                    details: {modeName: modeInput.modeName},
                };
            }
            // Safe: every requested mode's index was captured in initialIndexes before sampling began.
            const initialIndex = initialIndexes.get(modeInput.modeName)!;
            if (hashIndex(finalIndex) !== hashIndex(initialIndex)) {
                return {
                    code: "certification-evidence-build-source-bundle-drift",
                    severity: "error",
                    message: `mode "${modeInput.modeName}"'s own index in "${bundleDir}" changed while evidence was being sampled; refusing to publish evidence against an inconsistent snapshot.`,
                    details: {modeName: modeInput.modeName},
                };
            }
        }

        return undefined;
    }

    // Samples "modeInput.sampleCount" outcomes deterministically from "index" — a snapshot already captured
    // before this call, never re-read here or by anything this method calls. Each draw:
    // 1. selects a winning index entry via selectIndexEntryByCumulativeWeight against index.entries (the exact
    //    same cumulative-weight walk OutcomeLibraryBundleReader.drawOutcome uses internally, invoked directly
    //    against the pinned snapshot rather than through a wrapper that would re-read a fresh index);
    // 2. reads and verifies that exact entry's own byte range via readAndVerifyOutcomeAtByteRange (the same
    //    byte-range read + recordHash check readOutcomeById/drawOutcome themselves rely on) — never drawOutcome
    //    itself, which would re-read the index on every single call.
    // Fully synchronous (no I/O beyond direct fs.readSync calls inside readAndVerifyOutcomeAtByteRange and this
    // class's own writeFile), so nothing about a mode's own sampling can observe two different index states.
    private sampleMode(
        bundleDir: string,
        modeInput: CertificationEvidenceBundleModeSampleInput,
        sourceEntry: OutcomeLibraryBundleManifestModeEntry,
        index: OutcomeLibraryBundleModeIndex,
        stagingDir: string,
    ): CertificationEvidenceBundleModeEntry {
        const randomSource = this.randomSourceFactory(modeInput.seed);
        const outcomesFilePath = path.join(bundleDir, index.outcomesFile);

        const lines: string[] = [];
        for (let sampleIndex = 0; sampleIndex < modeInput.sampleCount; sampleIndex++) {
            const winningEntry = selectIndexEntryByCumulativeWeight(modeInput.modeName, index.entries, randomSource);
            const outcome = readAndVerifyOutcomeAtByteRange<T>(modeInput.modeName, outcomesFilePath, winningEntry);

            const record: CertificationEvidenceSampleRecord<T> = {
                modeName: modeInput.modeName,
                sampleIndex,
                seed: modeInput.seed,
                outcomeId: outcome.id,
                weight: outcome.weight,
                recordHash: winningEntry.recordHash,
                artifactHash: computeRoundArtifactHash(outcome.artifact),
                artifact: outcome.artifact,
            };
            lines.push(`${JSON.stringify(toCanonicalJson(record))}\n`);
        }

        const samplesFile = `samples_${modeInput.modeName}.jsonl`;
        const samplesPath = path.join(stagingDir, samplesFile);
        this.writeFile(samplesPath, lines.join(""));
        const samplesHash = sha256OfBytes(this.readFileBytes(samplesPath));

        return {
            modeName: modeInput.modeName,
            betMode: sourceEntry.betMode,
            stake: sourceEntry.stake,
            libraryId: sourceEntry.libraryId,
            libraryHash: sourceEntry.libraryHash,
            outcomeCount: sourceEntry.outcomeCount,
            totalWeight: sourceEntry.totalWeight,
            analysis: sourceEntry.analysis,
            sampleSeed: modeInput.seed,
            sampleCount: modeInput.sampleCount,
            samplesFile,
            samplesHash,
        };
    }

    private validateModesInput(modes: readonly CertificationEvidenceBundleModeSampleInput[]): ValidationIssue[] {
        const issues: ValidationIssue[] = [];
        if (modes.length === 0) {
            issues.push({code: "certification-evidence-build-modes-empty", severity: "error", message: "at least one mode must be given."});
            return issues;
        }

        const seenExact = new Map<string, number>();
        const seenCaseInsensitive = new Map<string, string>();
        for (const modeInput of modes) {
            if (!MODE_NAME_PATTERN.test(modeInput.modeName)) {
                issues.push({
                    code: "certification-evidence-build-mode-name-invalid",
                    severity: "error",
                    message: `mode name "${modeInput.modeName}" must match ${MODE_NAME_PATTERN}.`,
                    details: {modeName: modeInput.modeName},
                });
                continue;
            }

            const priorCount = seenExact.get(modeInput.modeName) ?? 0;
            seenExact.set(modeInput.modeName, priorCount + 1);
            if (priorCount > 0) {
                issues.push({
                    code: "certification-evidence-build-duplicate-mode-name",
                    severity: "error",
                    message: `mode name "${modeInput.modeName}" is used by more than one mode.`,
                    details: {modeName: modeInput.modeName},
                });
                continue;
            }

            const lowerCased = modeInput.modeName.toLowerCase();
            const priorCasing = seenCaseInsensitive.get(lowerCased);
            if (priorCasing !== undefined) {
                issues.push({
                    code: "certification-evidence-build-mode-name-case-collision",
                    severity: "error",
                    message: `mode names "${priorCasing}" and "${modeInput.modeName}" differ only in case.`,
                    details: {modeName: modeInput.modeName},
                });
                continue;
            }
            seenCaseInsensitive.set(lowerCased, modeInput.modeName);

            if (typeof modeInput.seed !== "string" || modeInput.seed.trim().length === 0) {
                issues.push({
                    code: "certification-evidence-build-seed-invalid",
                    severity: "error",
                    message: `mode "${modeInput.modeName}": seed must be a non-empty string.`,
                    details: {modeName: modeInput.modeName},
                });
            }

            if (!isPositiveSafeInteger(modeInput.sampleCount)) {
                issues.push({
                    code: "certification-evidence-build-sample-count-invalid",
                    severity: "error",
                    message: `mode "${modeInput.modeName}": sampleCount must be a positive safe integer.`,
                    details: {modeName: modeInput.modeName},
                });
            }
        }

        return issues;
    }
}
