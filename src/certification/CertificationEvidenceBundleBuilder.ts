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
import {OutcomeLibraryBundleReader} from "../weightedoutcome/bundle/OutcomeLibraryBundleReader.js";
import type {OutcomeLibraryBundleReading} from "../weightedoutcome/bundle/OutcomeLibraryBundleReading.js";
import {OutcomeLibraryBundleValidator} from "../weightedoutcome/bundle/OutcomeLibraryBundleValidator.js";
import type {OutcomeLibraryBundleValidating} from "../weightedoutcome/bundle/OutcomeLibraryBundleValidating.js";
import {
    CERTIFICATION_EVIDENCE_BUNDLE_MANIFEST_SCHEMA_VERSION,
    type CertificationEvidenceBundleManifest,
    type CertificationEvidenceBundleModeEntry,
} from "./CertificationEvidenceBundleManifest.js";
import type {CertificationEvidenceBundleBuildResult} from "./CertificationEvidenceBundleBuildResult.js";
import type {CertificationEvidenceBundleBuilding} from "./CertificationEvidenceBundleBuilding.js";
import type {CertificationEvidenceBundleModeSampleInput} from "./CertificationEvidenceBundleModeSampleInput.js";
import type {CertificationEvidenceSampleRecord} from "./CertificationEvidenceSampleRecord.js";

const MODE_NAME_PATTERN = /^[A-Za-z0-9_-]+$/;

function sha256OfBytes(bytes: string | Buffer): string {
    return `sha256:${crypto.createHash("sha256").update(bytes).digest("hex")}`;
}

// Builds a canonical POKIE certification/evidence bundle *on top of* an already-built, already-valid Outcome
// Library Bundle — deliberately never a second calculation path: every hash/metric this writes is either read
// verbatim off the source bundle's own manifest.json (libraryHash/outcomeCount/totalWeight/analysis), or
// produced by drawing samples through OutcomeLibraryBundleReading.drawOutcome — the exact same weighted-draw
// algorithm the pre-generated runtime itself uses (see docs/pregenerated-runtime.md), seeded with
// SeededWeightedOutcomeRandomSource so the same (bundleDir, modes) input always reproduces byte-identical
// output. Refuses to write anything (the same "no partial artifact" guarantee OutcomeLibraryBundleWriter and
// StakeEngineExporter already carry) if the source bundle itself doesn't deep-validate cleanly — evidence built
// on top of a library that doesn't even validate against its own rules can't be trusted either.
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
            return {
                outDir,
                files: [],
                manifest: undefined,
                issues: [
                    {
                        code: "certification-evidence-build-source-bundle-manifest-unreadable",
                        severity: "error",
                        message: `Could not read "${bundleDir}"'s own manifest.json: ${error instanceof Error ? error.message : String(error)}.`,
                    },
                ],
            };
        }

        const deepValidationIssues = await this.bundleValidator.validate(bundleDir, {deep: true});
        if (deepValidationIssues.some((issue) => issue.severity === "error")) {
            return {outDir, files: [], manifest: undefined, issues: [...upfrontIssues, ...deepValidationIssues]};
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
            return {outDir, files: [], manifest: undefined, issues: [...upfrontIssues, ...deepValidationIssues, ...missingModeIssues]};
        }

        const stagingDir = `${outDir}.staging-${crypto.randomBytes(6).toString("hex")}`;
        fs.mkdirSync(stagingDir, {recursive: true});
        try {
            const modeEntries: CertificationEvidenceBundleModeEntry[] = [];
            for (const modeInput of modes) {
                // Safe: checked to exist against sourceManifest.modes above.
                const sourceEntry = sourceManifest.modes.find((entry) => entry.modeName === modeInput.modeName)!;
                modeEntries.push(await this.sampleMode(bundleDir, modeInput, sourceEntry, stagingDir));
            }

            const sourceBundleManifestHash = sha256OfBytes(JSON.stringify(toCanonicalJson(sourceManifest)));
            const relativeFiles = [...modeEntries.map((entry) => entry.samplesFile), "manifest.json"];
            const generatedAt = this.now().toISOString();

            const manifest: CertificationEvidenceBundleManifest = {
                schemaVersion: CERTIFICATION_EVIDENCE_BUNDLE_MANIFEST_SCHEMA_VERSION,
                generatedBy: "pokie certification build",
                pokieVersion: this.pokieVersion,
                generatedAt,
                game: sourceManifest.game,
                ...(sourceManifest.configHash !== undefined ? {configHash: sourceManifest.configHash} : {}),
                artifactPokieVersion: sourceManifest.artifactPokieVersion,
                sourceBundleDir: bundleDir,
                sourceBundleManifestHash,
                modes: modeEntries,
                deepValidation: {ranAt: generatedAt, issues: deepValidationIssues},
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

    private async sampleMode(
        bundleDir: string,
        modeInput: CertificationEvidenceBundleModeSampleInput,
        sourceEntry: OutcomeLibraryBundleManifestModeEntry,
        stagingDir: string,
    ): Promise<CertificationEvidenceBundleModeEntry> {
        const index = await this.reader.readModeIndex(bundleDir, modeInput.modeName);
        const randomSource = this.randomSourceFactory(modeInput.seed);

        const lines: string[] = [];
        for (let sampleIndex = 0; sampleIndex < modeInput.sampleCount; sampleIndex++) {
            const outcome = await this.reader.drawOutcome(bundleDir, modeInput.modeName, randomSource);
            // Safe: drawOutcome only ever returns an outcome whose id is one of this same index's own entries.
            const indexEntry = index.entries.find((entry) => entry.id === outcome.id)!;

            const record: CertificationEvidenceSampleRecord<T> = {
                modeName: modeInput.modeName,
                sampleIndex,
                seed: modeInput.seed,
                outcomeId: outcome.id,
                weight: outcome.weight,
                recordHash: indexEntry.recordHash,
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

            if (!Number.isSafeInteger(modeInput.sampleCount) || modeInput.sampleCount <= 0) {
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
