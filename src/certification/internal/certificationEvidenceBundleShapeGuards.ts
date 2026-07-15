import {isPositiveSafeInteger} from "../../pregenerated/internal/isPositiveSafeInteger.js";
import type {ValidationIssue} from "../../validation/ValidationIssue.js";
import type {CertificationEvidenceBundleManifest, CertificationEvidenceBundleModeEntry} from "../CertificationEvidenceBundleManifest.js";
import type {CertificationEvidenceSampleRecord} from "../CertificationEvidenceSampleRecord.js";

// Shared, deliberately strict runtime shape guards for a candidate (possibly hand-crafted, possibly tampered)
// certification/evidence bundle — used by both CertificationEvidenceBundleValidator (self-consistency) and
// CertificationEvidenceBundleVerifier (live cross-check), so the two can never silently disagree on what counts
// as "a well-formed manifest/mode entry/sample record". A shape guard passing is a precondition for every
// content-level check (hash recomputation, cross-checking against a live bundle) in either class — an entry
// that fails one of these is always skipped (never crashes the caller), per this bundle format's own "never
// throw, return diagnostics" contract.

export const MODE_NAME_PATTERN = /^[A-Za-z0-9_-]+$/;
const SHA256_HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;
const VALID_SEVERITIES = new Set(["error", "warning", "info", "suggestion"]);
// Tolerance for a probability/frequency that's mathematically bounded to [0, 1] but was computed as a weighted
// floating-point mean — the same order-of-magnitude epsilon RoundArtifactValidator itself uses for its own
// floating-point comparisons.
const PROBABILITY_EPSILON = 1e-9;

export function isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
}

export function isFiniteNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
}

export function isNonNegativeFiniteNumber(value: unknown): value is number {
    return isFiniteNumber(value) && value >= 0;
}

export function isPositiveFiniteNumber(value: unknown): value is number {
    return isFiniteNumber(value) && value > 0;
}

function isProbabilityLike(value: unknown): value is number {
    return isFiniteNumber(value) && value >= -PROBABILITY_EPSILON && value <= 1 + PROBABILITY_EPSILON;
}

export function isNonNegativeSafeInteger(value: unknown): value is number {
    return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

export {isPositiveSafeInteger};

export function isValidSha256Hash(value: unknown): value is string {
    return typeof value === "string" && SHA256_HASH_PATTERN.test(value);
}

function isPokieGameManifestShape(value: unknown): value is {id: string; name: string; version: string; description?: string; author?: string} {
    if (typeof value !== "object" || value === null) {
        return false;
    }
    const game = value as Record<string, unknown>;
    return (
        isNonEmptyString(game.id) &&
        isNonEmptyString(game.name) &&
        isNonEmptyString(game.version) &&
        (game.description === undefined || typeof game.description === "string") &&
        (game.author === undefined || typeof game.author === "string")
    );
}

function isPayoutBucketShape(value: unknown): value is {payoutMultiplier: number; probability: number} {
    if (typeof value !== "object" || value === null) {
        return false;
    }
    const bucket = value as Record<string, unknown>;
    return isNonNegativeFiniteNumber(bucket.payoutMultiplier) && isProbabilityLike(bucket.probability);
}

function isWeightedOutcomeLibraryAnalysisShape(value: unknown): boolean {
    if (typeof value !== "object" || value === null) {
        return false;
    }
    const analysis = value as Record<string, unknown>;
    return (
        isPositiveSafeInteger(analysis.totalWeight) &&
        isNonNegativeFiniteNumber(analysis.rtp) &&
        isProbabilityLike(analysis.hitFrequency) &&
        isProbabilityLike(analysis.zeroWinFrequency) &&
        isNonNegativeFiniteNumber(analysis.variance) &&
        isNonNegativeFiniteNumber(analysis.standardDeviation) &&
        isNonNegativeFiniteNumber(analysis.maxWin) &&
        isProbabilityLike(analysis.maxWinProbability) &&
        Array.isArray(analysis.payoutDistribution) &&
        analysis.payoutDistribution.every((bucket) => isPayoutBucketShape(bucket))
    );
}

function isValidationIssueShape(value: unknown): value is ValidationIssue {
    if (typeof value !== "object" || value === null) {
        return false;
    }
    const issue = value as Partial<Record<keyof ValidationIssue, unknown>>;
    return (
        isNonEmptyString(issue.code) &&
        typeof issue.severity === "string" &&
        VALID_SEVERITIES.has(issue.severity) &&
        isNonEmptyString(issue.message) &&
        (issue.details === undefined || (typeof issue.details === "object" && issue.details !== null)) &&
        (issue.suggestion === undefined || typeof issue.suggestion === "string")
    );
}

function isDeepValidationShape(value: unknown): value is {ranAt: string; issues: readonly ValidationIssue[]} {
    if (typeof value !== "object" || value === null) {
        return false;
    }
    const deepValidation = value as Record<string, unknown>;
    return isNonEmptyString(deepValidation.ranAt) && Array.isArray(deepValidation.issues) && deepValidation.issues.every((issue) => isValidationIssueShape(issue));
}

// Strict per-field shape check for one manifest mode entry — every numeric field is checked against the exact
// invariant the Outcome Library Bundle format (and RoundArtifact) itself already requires: outcomeCount/
// totalWeight/sample weight are positive safe integers (this bundle format's own weighted-draw path requires
// exact integer weights — see OutcomeLibraryBundleReader.drawOutcome), stake is a finite number strictly greater
// than zero (RoundArtifact's own invariant).
export function isModeEntryShape(value: unknown): value is CertificationEvidenceBundleModeEntry {
    if (typeof value !== "object" || value === null) {
        return false;
    }
    const entry = value as Partial<Record<keyof CertificationEvidenceBundleModeEntry, unknown>>;
    return (
        isNonEmptyString(entry.modeName) &&
        isNonEmptyString(entry.betMode) &&
        isPositiveFiniteNumber(entry.stake) &&
        isNonEmptyString(entry.libraryId) &&
        isValidSha256Hash(entry.libraryHash) &&
        isPositiveSafeInteger(entry.outcomeCount) &&
        isPositiveSafeInteger(entry.totalWeight) &&
        isWeightedOutcomeLibraryAnalysisShape(entry.analysis) &&
        isNonEmptyString(entry.sampleSeed) &&
        isPositiveSafeInteger(entry.sampleCount) &&
        isNonEmptyString(entry.samplesFile) &&
        isValidSha256Hash(entry.samplesHash)
    );
}

// Top-level shape check only — does NOT deeply validate every "modes" entry (use isModeEntryShape per entry) or
// every "files" entry; callers that need per-element correctness check those separately, so a single malformed
// mode/sample/file never has to invalidate an otherwise well-formed manifest's other entries.
export function isManifestShape(value: unknown): value is CertificationEvidenceBundleManifest {
    if (typeof value !== "object" || value === null) {
        return false;
    }
    const manifest = value as Partial<Record<keyof CertificationEvidenceBundleManifest, unknown>>;
    return (
        typeof manifest.schemaVersion === "number" &&
        isNonEmptyString(manifest.generatedBy) &&
        isNonEmptyString(manifest.pokieVersion) &&
        isNonEmptyString(manifest.generatedAt) &&
        isPokieGameManifestShape(manifest.game) &&
        (manifest.configHash === undefined || isNonEmptyString(manifest.configHash)) &&
        isNonEmptyString(manifest.artifactPokieVersion) &&
        isNonEmptyString(manifest.sourceBundleDir) &&
        isValidSha256Hash(manifest.sourceBundleManifestHash) &&
        isValidSha256Hash(manifest.evidenceContentHash) &&
        Array.isArray(manifest.modes) &&
        isDeepValidationShape(manifest.deepValidation) &&
        Array.isArray(manifest.files)
    );
}

export function isSampleRecordShape(value: unknown): value is CertificationEvidenceSampleRecord {
    if (typeof value !== "object" || value === null) {
        return false;
    }
    const record = value as Partial<Record<keyof CertificationEvidenceSampleRecord, unknown>>;
    return (
        isNonEmptyString(record.modeName) &&
        isNonNegativeSafeInteger(record.sampleIndex) &&
        isNonEmptyString(record.seed) &&
        isNonEmptyString(record.outcomeId) &&
        isPositiveSafeInteger(record.weight) &&
        isValidSha256Hash(record.recordHash) &&
        isValidSha256Hash(record.artifactHash) &&
        typeof record.artifact === "object" &&
        record.artifact !== null
    );
}
