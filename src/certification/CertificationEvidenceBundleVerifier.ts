import fs from "fs";
import path from "path";
import {toCanonicalJson} from "../json/toCanonicalJson.js";
import {SeededWeightedOutcomeRandomSource} from "../pregenerated/SeededWeightedOutcomeRandomSource.js";
import type {WeightedOutcomeRandomSource} from "../pregenerated/WeightedOutcomeRandomSource.js";
import {resolveSafeStakeEngineFilePath} from "../stakeengine/internal/resolveSafeStakeEngineFilePath.js";
import type {ValidationIssue} from "../validation/ValidationIssue.js";
import type {OutcomeLibraryBundleManifest} from "../weightedoutcome/bundle/OutcomeLibraryBundleManifest.js";
import type {OutcomeLibraryBundleModeIndex} from "../weightedoutcome/bundle/OutcomeLibraryBundleModeIndex.js";
import {OutcomeLibraryBundleReader} from "../weightedoutcome/bundle/OutcomeLibraryBundleReader.js";
import type {OutcomeLibraryBundleReading} from "../weightedoutcome/bundle/OutcomeLibraryBundleReading.js";
import {OutcomeLibraryBundleValidator} from "../weightedoutcome/bundle/OutcomeLibraryBundleValidator.js";
import type {OutcomeLibraryBundleValidating} from "../weightedoutcome/bundle/OutcomeLibraryBundleValidating.js";
import type {CertificationEvidenceBundleManifest, CertificationEvidenceBundleModeEntry} from "./CertificationEvidenceBundleManifest.js";
import {CertificationEvidenceBundleValidator} from "./CertificationEvidenceBundleValidator.js";
import type {CertificationEvidenceBundleValidating} from "./CertificationEvidenceBundleValidating.js";
import type {CertificationEvidenceBundleVerifying} from "./CertificationEvidenceBundleVerifying.js";
import type {CertificationEvidenceSampleRecord} from "./CertificationEvidenceSampleRecord.js";
import type {CertificationEvidenceVerifyOptions} from "./CertificationEvidenceVerifyOptions.js";
import {isManifestShape, isModeEntryShape, isSampleRecordShape} from "./internal/certificationEvidenceBundleShapeGuards.js";
import {sha256OfBytes} from "./internal/sha256OfBytes.js";

// Structural-only codes CertificationEvidenceBundleValidating can report when manifest.json itself couldn't
// even be parsed far enough to know what source bundle to cross-check against — a genuine "nothing to verify"
// case, as opposed to a structural issue against one particular mode/sample that still leaves the rest
// cross-checkable.
const MANIFEST_UNREADABLE_CODES = new Set([
    "certification-evidence-bundle-malformed",
    "certification-evidence-bundle-manifest-missing",
    "certification-evidence-bundle-manifest-unreadable",
    "certification-evidence-bundle-manifest-invalid-json",
    "certification-evidence-bundle-manifest-malformed",
    "certification-evidence-bundle-manifest-schema-version-unsupported",
]);

type SafeSampleRecord = {readonly position: number; readonly record: CertificationEvidenceSampleRecord};

function canonicalJsonEqual(a: unknown, b: unknown): boolean {
    return JSON.stringify(toCanonicalJson(a)) === JSON.stringify(toCanonicalJson(b));
}

// Verifies a certification/evidence bundle against the live source Outcome Library Bundle it was built from.
// Requires an explicit options.sourceBundleDir — the manifest's own recorded sourceBundleDir is purely
// informational (a hand-crafted or tampered manifest could point it anywhere) and is NEVER read or trusted
// here; without it, verify() returns a diagnostic and reads nothing beyond certDir's own structural self-
// consistency check. Never throws — every fallible step (re-reading manifest.json, reading a samples file,
// parsing a sample line, reading the live bundle) is individually guarded, and a top-level try/catch is the
// final safety net — and never reads a path outside certDir/sourceBundleDir: every filename this class reads
// off manifest data (a mode's own samplesFile) is resolved through resolveSafeStakeEngineFilePath first, the
// same guard CertificationEvidenceBundleValidator itself uses, independently re-checked here rather than
// assumed from the validator's own earlier pass (a re-read of the same file could in principle observe
// something different).
// A structurally invalid mode entry or an invalid sample line is skipped — with a diagnostic — rather than
// aborting the whole verification; the rest of the bundle is still cross-checked.
//
// Cross-checks four distinct things against the live bundle, none of them a second, differently-derived
// calculation:
// - the evidence bundle's own manifest fields (game/configHash/artifactPokieVersion, and the whole source
//   bundle manifest's own recomputed hash);
// - the source bundle's own on-disk files, via a shallow OutcomeLibraryBundleValidating pass;
// - each mode's own metrics (libraryHash/outcomeCount/totalWeight/analysis), read straight off the live
//   manifest and compared field-by-field;
// - each sampled outcome, two ways: its own recordHash compared directly against the live mode index's own
//   entry (cheap, index-only — no byte-range read), and the *sequence itself* reproduced by redrawing this
//   mode's own recorded seed against the live bundle via OutcomeLibraryBundleReading.drawOutcome (the same
//   weighted-draw algorithm the sample was originally drawn with) and comparing the outcome id picked at each
//   position — this is what catches a sample record substituted with a different, individually-valid, still-
//   existing outcome id, which a per-id existence/hash check alone could never catch.
export class CertificationEvidenceBundleVerifier implements CertificationEvidenceBundleVerifying {
    private readonly validator: CertificationEvidenceBundleValidating;
    private readonly sourceValidator: OutcomeLibraryBundleValidating;
    private readonly reader: OutcomeLibraryBundleReading;
    private readonly randomSourceFactory: (seed: string) => WeightedOutcomeRandomSource;

    constructor(
        validator: CertificationEvidenceBundleValidating = new CertificationEvidenceBundleValidator(),
        sourceValidator: OutcomeLibraryBundleValidating = new OutcomeLibraryBundleValidator(),
        reader: OutcomeLibraryBundleReading = new OutcomeLibraryBundleReader(),
        randomSourceFactory: (seed: string) => WeightedOutcomeRandomSource = (seed) => new SeededWeightedOutcomeRandomSource(seed),
    ) {
        this.validator = validator;
        this.sourceValidator = sourceValidator;
        this.reader = reader;
        this.randomSourceFactory = randomSourceFactory;
    }

    public async verify(certDir: string, options?: CertificationEvidenceVerifyOptions): Promise<ValidationIssue[]> {
        try {
            return await this.verifyInternal(certDir, options);
        } catch (error) {
            return [
                {
                    code: "certification-evidence-verify-malformed",
                    severity: "error",
                    message: `"${certDir}" could not be verified: ${error instanceof Error ? error.message : String(error)}.`,
                },
            ];
        }
    }

    private async verifyInternal(certDir: string, options: CertificationEvidenceVerifyOptions | undefined): Promise<ValidationIssue[]> {
        const structuralIssues = await this.validator.validate(certDir);
        if (structuralIssues.some((issue) => MANIFEST_UNREADABLE_CODES.has(issue.code))) {
            return structuralIssues;
        }

        // manifest.sourceBundleDir is informational only (see its own doc comment) and is NEVER read or
        // trusted here — a caller must always give an explicit sourceBundleDir. Checked before anything else
        // below touches a path outside certDir (including re-parsing manifest.json, which is only ever needed
        // for the live cross-check that follows), so a caller who omits it gets a diagnostic without this class
        // ever reading anything beyond certDir's own structural self-consistency check above.
        if (options?.sourceBundleDir === undefined) {
            return [
                ...structuralIssues,
                {
                    code: "certification-evidence-verify-source-bundle-dir-required",
                    severity: "error",
                    message:
                        "no sourceBundleDir was given. This evidence bundle's own manifest.sourceBundleDir is " +
                        "informational only and is never trusted for verification — pass an explicit " +
                        '{sourceBundleDir} (or "--source <bundleDir>" on the CLI) to cross-check against the live source bundle.',
                },
            ];
        }
        const sourceBundleDir = options.sourceBundleDir;

        let manifest: CertificationEvidenceBundleManifest;
        try {
            const parsed: unknown = JSON.parse(fs.readFileSync(path.join(certDir, "manifest.json"), "utf-8"));
            if (!isManifestShape(parsed)) {
                return [
                    ...structuralIssues,
                    {
                        code: "certification-evidence-verify-manifest-unreadable",
                        severity: "error",
                        message: `"${certDir}"'s own manifest.json no longer matches the expected shape.`,
                    },
                ];
            }
            manifest = parsed;
        } catch (error) {
            return [
                ...structuralIssues,
                {
                    code: "certification-evidence-verify-manifest-unreadable",
                    severity: "error",
                    message: `could not re-read "${certDir}"'s own manifest.json: ${error instanceof Error ? error.message : String(error)}.`,
                },
            ];
        }

        const issues: ValidationIssue[] = [...structuralIssues];

        let sourceManifest: OutcomeLibraryBundleManifest;
        try {
            sourceManifest = await this.reader.readManifest(sourceBundleDir);
        } catch (error) {
            issues.push({
                code: "certification-evidence-verify-source-bundle-unreadable",
                severity: "error",
                message: `could not read "${sourceBundleDir}"'s own manifest.json: ${error instanceof Error ? error.message : String(error)}.`,
            });
            return issues;
        }

        // Detects tampering/corruption of the source bundle's own on-disk files ("library files" drift) — a
        // shallow check by default, the same "never defeat the whole point of a streaming bundle" discipline
        // OutcomeLibraryBundleValidating itself follows; each sampled outcome below is still independently
        // deep-checked, just for exactly the records this evidence actually cites.
        issues.push(...(await this.sourceValidator.validate(sourceBundleDir)));

        if (sha256OfBytes(JSON.stringify(toCanonicalJson(sourceManifest))) !== manifest.sourceBundleManifestHash) {
            issues.push({
                code: "certification-evidence-verify-source-bundle-manifest-changed",
                severity: "error",
                message: `"${sourceBundleDir}"'s own manifest.json no longer hashes to what this evidence bundle recorded at build time.`,
            });
        }

        if (
            manifest.game.id !== sourceManifest.game.id ||
            manifest.game.version !== sourceManifest.game.version ||
            manifest.configHash !== sourceManifest.configHash ||
            manifest.artifactPokieVersion !== sourceManifest.artifactPokieVersion
        ) {
            issues.push({
                code: "certification-evidence-verify-manifest-provenance-mismatch",
                severity: "error",
                message: `this evidence bundle's own game/configHash/artifactPokieVersion no longer matches "${sourceBundleDir}"'s own manifest.json.`,
            });
        }

        for (const rawModeEntry of manifest.modes) {
            if (!isModeEntryShape(rawModeEntry)) {
                issues.push({
                    code: "certification-evidence-bundle-mode-field-invalid",
                    severity: "error",
                    message: `manifest.json has a "modes" entry that doesn't match the expected shape — skipping its cross-check: ${JSON.stringify(rawModeEntry)}.`,
                });
                continue;
            }
            await this.verifyModeAgainstLiveBundle(certDir, sourceBundleDir, sourceManifest, rawModeEntry, issues);
        }

        return issues;
    }

    private async verifyModeAgainstLiveBundle(
        certDir: string,
        sourceBundleDir: string,
        sourceManifest: OutcomeLibraryBundleManifest,
        modeEntry: CertificationEvidenceBundleModeEntry,
        issues: ValidationIssue[],
    ): Promise<void> {
        const sourceEntry = sourceManifest.modes.find((entry) => entry.modeName === modeEntry.modeName);
        if (sourceEntry === undefined) {
            issues.push({
                code: "certification-evidence-verify-source-mode-missing",
                severity: "error",
                message: `mode "${modeEntry.modeName}" is no longer present in "${sourceBundleDir}"'s own manifest.json.`,
                details: {modeName: modeEntry.modeName},
            });
            return;
        }

        if (
            sourceEntry.libraryId !== modeEntry.libraryId ||
            sourceEntry.betMode !== modeEntry.betMode ||
            sourceEntry.stake !== modeEntry.stake ||
            sourceEntry.libraryHash !== modeEntry.libraryHash
        ) {
            issues.push({
                code: "certification-evidence-verify-manifest-mode-mismatch",
                severity: "error",
                message: `mode "${modeEntry.modeName}": libraryId/betMode/stake/libraryHash no longer match "${sourceBundleDir}"'s own manifest.json.`,
                details: {modeName: modeEntry.modeName},
            });
        }

        const metricsMatch =
            sourceEntry.outcomeCount === modeEntry.outcomeCount &&
            sourceEntry.totalWeight === modeEntry.totalWeight &&
            canonicalJsonEqual(sourceEntry.analysis, modeEntry.analysis);
        if (!metricsMatch) {
            issues.push({
                code: "certification-evidence-verify-metrics-mismatch",
                severity: "error",
                message: `mode "${modeEntry.modeName}": outcomeCount/totalWeight/analysis no longer match "${sourceBundleDir}"'s own manifest.json.`,
                details: {modeName: modeEntry.modeName},
            });
        }

        const safeSamplesPath = resolveSafeStakeEngineFilePath(certDir, modeEntry.samplesFile);
        if (safeSamplesPath === undefined) {
            issues.push({
                code: "certification-evidence-verify-path-unsafe",
                severity: "error",
                message: `mode "${modeEntry.modeName}": samplesFile "${modeEntry.samplesFile}" is not a safe filename — skipping its sample cross-check.`,
                details: {modeName: modeEntry.modeName},
            });
            return;
        }

        const records = this.readSampleRecordsSafely(safeSamplesPath, modeEntry, issues);

        let liveIndex: OutcomeLibraryBundleModeIndex;
        try {
            liveIndex = await this.reader.readModeIndex(sourceBundleDir, modeEntry.modeName);
        } catch (error) {
            issues.push({
                code: "certification-evidence-verify-source-mode-index-unreadable",
                severity: "error",
                message: `mode "${modeEntry.modeName}": could not read its own index in "${sourceBundleDir}": ${error instanceof Error ? error.message : String(error)}.`,
                details: {modeName: modeEntry.modeName},
            });
            return;
        }

        // recordHash cross-check: cheap, index-only — no byte-range read needed, since a mode's own index
        // entry already carries the exact recordHash a matching, untampered outcome must hash to.
        for (const {record} of records) {
            const liveEntry = liveIndex.entries.find((entry) => entry.id === record.outcomeId);
            if (liveEntry === undefined) {
                issues.push({
                    code: "certification-evidence-verify-sample-outcome-missing",
                    severity: "error",
                    message: `mode "${modeEntry.modeName}": outcome "${record.outcomeId}" is no longer present in "${sourceBundleDir}".`,
                    details: {modeName: modeEntry.modeName, outcomeId: record.outcomeId},
                });
                continue;
            }
            if (liveEntry.recordHash !== record.recordHash) {
                issues.push({
                    code: "certification-evidence-verify-sample-record-hash-mismatch",
                    severity: "error",
                    message: `mode "${modeEntry.modeName}": outcome "${record.outcomeId}" no longer hashes to this evidence bundle's own recorded recordHash in "${sourceBundleDir}".`,
                    details: {modeName: modeEntry.modeName, outcomeId: record.outcomeId},
                });
            }
        }

        await this.verifySampleSequence(sourceBundleDir, modeEntry, records, issues);
    }

    // Reads and parses "samplesPath" defensively: a missing file, a line that isn't valid JSON, or a line that
    // doesn't match CertificationEvidenceSampleRecord's own shape is reported as a diagnostic and simply
    // excluded from the returned records, never thrown — the rest of this mode's samples are still cross-
    // checked.
    private readSampleRecordsSafely(samplesPath: string, modeEntry: CertificationEvidenceBundleModeEntry, issues: ValidationIssue[]): SafeSampleRecord[] {
        let bytes: string;
        try {
            bytes = fs.readFileSync(samplesPath, "utf-8");
        } catch (error) {
            issues.push({
                code: "certification-evidence-verify-samples-file-unreadable",
                severity: "error",
                message: `mode "${modeEntry.modeName}": could not read "${modeEntry.samplesFile}": ${error instanceof Error ? error.message : String(error)}.`,
                details: {modeName: modeEntry.modeName},
            });
            return [];
        }

        const safeRecords: SafeSampleRecord[] = [];
        const lines = bytes.split("\n").filter((line) => line.length > 0);
        lines.forEach((line, position) => {
            let parsedLine: unknown;
            try {
                parsedLine = JSON.parse(line);
            } catch (error) {
                issues.push({
                    code: "certification-evidence-bundle-sample-line-invalid-json",
                    severity: "error",
                    message: `mode "${modeEntry.modeName}": line ${position} of "${modeEntry.samplesFile}" is not valid JSON (${error instanceof Error ? error.message : String(error)}) — skipping its cross-check.`,
                    details: {modeName: modeEntry.modeName, position},
                });
                return;
            }
            if (!isSampleRecordShape(parsedLine)) {
                issues.push({
                    code: "certification-evidence-bundle-sample-line-malformed",
                    severity: "error",
                    message: `mode "${modeEntry.modeName}": line ${position} of "${modeEntry.samplesFile}" doesn't match the expected sample record shape — skipping its cross-check.`,
                    details: {modeName: modeEntry.modeName, position},
                });
                return;
            }
            safeRecords.push({position, record: parsedLine});
        });
        return safeRecords;
    }

    // Reproduces the exact deterministic draw sequence this mode's own recorded seed produces against the
    // *live* bundle — one SeededWeightedOutcomeRandomSource for the whole mode, drawn from sequentially via
    // OutcomeLibraryBundleReading.drawOutcome (never a second, differently-derived selection algorithm) — and
    // compares the outcome id it selects at each position against what this evidence bundle actually recorded
    // there. This is what catches a sample record substituted with a different, individually valid, still-
    // existing outcome id: a per-id existence/recordHash check alone (see the caller) can never catch that,
    // since a swapped-in id can be perfectly genuine and untampered — it's simply not the one this seed would
    // have drawn at that position.
    private async verifySampleSequence(
        sourceBundleDir: string,
        modeEntry: CertificationEvidenceBundleModeEntry,
        records: readonly SafeSampleRecord[],
        issues: ValidationIssue[],
    ): Promise<void> {
        const recordedIdByPosition = new Map(records.map(({position, record}) => [position, record.outcomeId]));
        const randomSource = this.randomSourceFactory(modeEntry.sampleSeed);

        for (let position = 0; position < modeEntry.sampleCount; position++) {
            let expectedOutcomeId: string;
            try {
                expectedOutcomeId = (await this.reader.drawOutcome(sourceBundleDir, modeEntry.modeName, randomSource)).id;
            } catch (error) {
                issues.push({
                    code: "certification-evidence-verify-source-bundle-outcome-invariant",
                    severity: "error",
                    message: `mode "${modeEntry.modeName}": redrawing position ${position} against the live bundle failed: ${error instanceof Error ? error.message : String(error)}.`,
                    details: {modeName: modeEntry.modeName, position},
                });
                continue;
            }

            const recordedOutcomeId = recordedIdByPosition.get(position);
            if (recordedOutcomeId !== undefined && recordedOutcomeId !== expectedOutcomeId) {
                issues.push({
                    code: "certification-evidence-verify-sample-sequence-mismatch",
                    severity: "error",
                    message: `mode "${modeEntry.modeName}": position ${position}'s recorded sample is outcome "${recordedOutcomeId}", but redrawing this mode's own seed "${modeEntry.sampleSeed}" against the live bundle deterministically selects "${expectedOutcomeId}" instead.`,
                    details: {modeName: modeEntry.modeName, position, recordedOutcomeId, expectedOutcomeId},
                });
            }
        }
    }
}
