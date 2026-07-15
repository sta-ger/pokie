import crypto from "crypto";
import fs from "fs";
import path from "path";
import {computeRoundArtifactHash} from "../artifact/computeRoundArtifactHash.js";
import type {RoundArtifact} from "../artifact/RoundArtifact.js";
import {toCanonicalJson} from "../json/toCanonicalJson.js";
import type {ValidationIssue} from "../validation/ValidationIssue.js";
import {OutcomeLibraryBundleInvariantError} from "../weightedoutcome/bundle/OutcomeLibraryBundleInvariantError.js";
import type {OutcomeLibraryBundleManifest} from "../weightedoutcome/bundle/OutcomeLibraryBundleManifest.js";
import {OutcomeLibraryBundleReader} from "../weightedoutcome/bundle/OutcomeLibraryBundleReader.js";
import type {OutcomeLibraryBundleReading} from "../weightedoutcome/bundle/OutcomeLibraryBundleReading.js";
import {OutcomeLibraryBundleValidator} from "../weightedoutcome/bundle/OutcomeLibraryBundleValidator.js";
import type {OutcomeLibraryBundleValidating} from "../weightedoutcome/bundle/OutcomeLibraryBundleValidating.js";
import type {CertificationEvidenceBundleManifest} from "./CertificationEvidenceBundleManifest.js";
import {CertificationEvidenceBundleValidator} from "./CertificationEvidenceBundleValidator.js";
import type {CertificationEvidenceBundleValidating} from "./CertificationEvidenceBundleValidating.js";
import type {CertificationEvidenceBundleVerifying} from "./CertificationEvidenceBundleVerifying.js";
import type {CertificationEvidenceSampleRecord} from "./CertificationEvidenceSampleRecord.js";
import type {CertificationEvidenceVerifyOptions} from "./CertificationEvidenceVerifyOptions.js";

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

function canonicalJsonEqual(a: unknown, b: unknown): boolean {
    return JSON.stringify(toCanonicalJson(a)) === JSON.stringify(toCanonicalJson(b));
}

function readSampleRecords(certDir: string, samplesFile: string): CertificationEvidenceSampleRecord[] {
    return fs
        .readFileSync(path.join(certDir, samplesFile), "utf-8")
        .split("\n")
        .filter((line) => line.length > 0)
        .map((line) => JSON.parse(line) as CertificationEvidenceSampleRecord);
}

// Verifies a certification/evidence bundle against the live source Outcome Library Bundle it was built from.
// Never recomputes RTP/hashes by a second, differently-derived method — every comparison here is either a
// straight equality check against a value already computed once (by the source bundle's own writer, or by
// CertificationEvidenceBundleBuilder at evidence-build time), or delegates to OutcomeLibraryBundleReading/
// OutcomeLibraryBundleValidating, the same read/validate surface every other bundle consumer in this codebase
// uses.
export class CertificationEvidenceBundleVerifier implements CertificationEvidenceBundleVerifying {
    private readonly validator: CertificationEvidenceBundleValidating;
    private readonly sourceValidator: OutcomeLibraryBundleValidating;
    private readonly reader: OutcomeLibraryBundleReading;

    constructor(
        validator: CertificationEvidenceBundleValidating = new CertificationEvidenceBundleValidator(),
        sourceValidator: OutcomeLibraryBundleValidating = new OutcomeLibraryBundleValidator(),
        reader: OutcomeLibraryBundleReading = new OutcomeLibraryBundleReader(),
    ) {
        this.validator = validator;
        this.sourceValidator = sourceValidator;
        this.reader = reader;
    }

    public async verify(certDir: string, options?: CertificationEvidenceVerifyOptions): Promise<ValidationIssue[]> {
        const structuralIssues = await this.validator.validate(certDir);
        if (structuralIssues.some((issue) => MANIFEST_UNREADABLE_CODES.has(issue.code))) {
            return structuralIssues;
        }

        const manifest = JSON.parse(fs.readFileSync(path.join(certDir, "manifest.json"), "utf-8")) as CertificationEvidenceBundleManifest;
        const sourceBundleDir = options?.sourceBundleDir ?? manifest.sourceBundleDir;

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
        // OutcomeLibraryBundleValidating itself follows; every sampled outcome below is still independently
        // deep-checked via readOutcomeById, just for exactly the records this evidence actually cites.
        issues.push(...(await this.sourceValidator.validate(sourceBundleDir)));

        const recomputedSourceManifestHash = `sha256:${crypto.createHash("sha256").update(JSON.stringify(toCanonicalJson(sourceManifest))).digest("hex")}`;
        if (recomputedSourceManifestHash !== manifest.sourceBundleManifestHash) {
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

        for (const modeEntry of manifest.modes) {
            const sourceEntry = sourceManifest.modes.find((entry) => entry.modeName === modeEntry.modeName);
            if (sourceEntry === undefined) {
                issues.push({
                    code: "certification-evidence-verify-source-mode-missing",
                    severity: "error",
                    message: `mode "${modeEntry.modeName}" is no longer present in "${sourceBundleDir}"'s own manifest.json.`,
                    details: {modeName: modeEntry.modeName},
                });
                continue;
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

            for (const record of readSampleRecords(certDir, modeEntry.samplesFile)) {
                await this.verifySampleAgainstLiveBundle(sourceBundleDir, modeEntry.modeName, record, issues);
            }
        }

        return issues;
    }

    private async verifySampleAgainstLiveBundle(
        sourceBundleDir: string,
        modeName: string,
        record: CertificationEvidenceSampleRecord,
        issues: ValidationIssue[],
    ): Promise<void> {
        try {
            const liveOutcome = await this.reader.readOutcomeById(sourceBundleDir, modeName, record.outcomeId);
            if (liveOutcome === undefined) {
                issues.push({
                    code: "certification-evidence-verify-sample-outcome-missing",
                    severity: "error",
                    message: `mode "${modeName}": outcome "${record.outcomeId}" is no longer present in "${sourceBundleDir}".`,
                    details: {modeName, outcomeId: record.outcomeId},
                });
                return;
            }
            if (liveOutcome.weight !== record.weight || computeRoundArtifactHash(liveOutcome.artifact as RoundArtifact) !== record.artifactHash) {
                issues.push({
                    code: "certification-evidence-verify-sample-outcome-changed",
                    severity: "error",
                    message: `mode "${modeName}": outcome "${record.outcomeId}" no longer matches this evidence bundle's own recorded sample.`,
                    details: {modeName, outcomeId: record.outcomeId},
                });
            }
        } catch (error) {
            if (error instanceof OutcomeLibraryBundleInvariantError) {
                issues.push({
                    code: "certification-evidence-verify-sample-outcome-changed",
                    severity: "error",
                    message: `mode "${modeName}": outcome "${record.outcomeId}" ${error.message}`,
                    details: {modeName, outcomeId: record.outcomeId},
                });
                return;
            }
            throw error;
        }
    }
}
