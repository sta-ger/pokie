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
//
// Every guard below is *closed*: it rejects an object carrying any key beyond the ones this schema actually
// defines, not just one missing a required key or holding a wrong-typed value — an object with an extra,
// unexpected field is exactly as invalid as one missing a required field. This matters because
// computeCertificationEvidenceContentHash only ever hashes the fields these guards already know about; an
// unknown field smuggled in outside that set would otherwise be invisible to every hash-based check in this
// bundle format. The one deliberate exception is ValidationIssue.details, a genuinely free-form bag used
// differently by every issue code in this codebase — its own keys are never restricted.

export const MODE_NAME_PATTERN = /^[A-Za-z0-9_-]+$/;
const SHA256_HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;
const VALID_SEVERITIES = new Set(["error", "warning", "info", "suggestion"]);
// Tolerance for a probability/frequency that's mathematically bounded to [0, 1] but was computed as a weighted
// floating-point mean — the same order-of-magnitude epsilon RoundArtifactValidator itself uses for its own
// floating-point comparisons.
const PROBABILITY_EPSILON = 1e-9;

function hasOnlyAllowedKeys(value: object, allowedKeys: ReadonlySet<string>): boolean {
    return Object.keys(value).every((key) => allowedKeys.has(key));
}

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

const POKIE_GAME_MANIFEST_KEYS = new Set(["id", "name", "version", "description", "author"]);

function isPokieGameManifestShape(value: unknown): value is {id: string; name: string; version: string; description?: string; author?: string} {
    if (typeof value !== "object" || value === null || !hasOnlyAllowedKeys(value, POKIE_GAME_MANIFEST_KEYS)) {
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

const PAYOUT_BUCKET_KEYS = new Set(["payoutMultiplier", "probability"]);

function isPayoutBucketShape(value: unknown): value is {payoutMultiplier: number; probability: number} {
    if (typeof value !== "object" || value === null || !hasOnlyAllowedKeys(value, PAYOUT_BUCKET_KEYS)) {
        return false;
    }
    const bucket = value as Record<string, unknown>;
    return isNonNegativeFiniteNumber(bucket.payoutMultiplier) && isProbabilityLike(bucket.probability);
}

const WEIGHTED_OUTCOME_LIBRARY_ANALYSIS_KEYS = new Set([
    "totalWeight",
    "rtp",
    "hitFrequency",
    "zeroWinFrequency",
    "variance",
    "standardDeviation",
    "maxWin",
    "maxWinProbability",
    "payoutDistribution",
]);

function isWeightedOutcomeLibraryAnalysisShape(value: unknown): boolean {
    if (typeof value !== "object" || value === null || !hasOnlyAllowedKeys(value, WEIGHTED_OUTCOME_LIBRARY_ANALYSIS_KEYS)) {
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

const VALIDATION_ISSUE_KEYS = new Set(["code", "severity", "message", "details", "suggestion", "path"]);

// "details" is deliberately exempt from the closed-shape rule above — it's the one genuinely free-form bag in
// this whole schema, shaped differently by every issue code in this codebase (see ValidationIssue.details).
// "path" (added alongside "details"/"suggestion" as an optional field) stays a plain non-empty string like
// every other scalar field here, and — unlike "details" — is fully covered by this file's own hash-relevance
// guarantee: since it's part of the closed key set, computeCertificationEvidenceContentHash's structural
// canonicalization (toCanonicalJson) already picks it up automatically.
function isValidationIssueShape(value: unknown): value is ValidationIssue {
    if (typeof value !== "object" || value === null || !hasOnlyAllowedKeys(value, VALIDATION_ISSUE_KEYS)) {
        return false;
    }
    const issue = value as Partial<Record<keyof ValidationIssue, unknown>>;
    return (
        isNonEmptyString(issue.code) &&
        typeof issue.severity === "string" &&
        VALID_SEVERITIES.has(issue.severity) &&
        isNonEmptyString(issue.message) &&
        (issue.details === undefined || (typeof issue.details === "object" && issue.details !== null)) &&
        (issue.suggestion === undefined || typeof issue.suggestion === "string") &&
        (issue.path === undefined || isNonEmptyString(issue.path))
    );
}

const DEEP_VALIDATION_KEYS = new Set(["ranAt", "issues"]);

function isDeepValidationShape(value: unknown): value is {ranAt: string; issues: readonly ValidationIssue[]} {
    if (typeof value !== "object" || value === null || !hasOnlyAllowedKeys(value, DEEP_VALIDATION_KEYS)) {
        return false;
    }
    const deepValidation = value as Record<string, unknown>;
    return isNonEmptyString(deepValidation.ranAt) && Array.isArray(deepValidation.issues) && deepValidation.issues.every((issue) => isValidationIssueShape(issue));
}

const MODE_ENTRY_KEYS = new Set([
    "modeName",
    "betMode",
    "stake",
    "libraryId",
    "libraryHash",
    "outcomeCount",
    "totalWeight",
    "analysis",
    "sampleSeed",
    "sampleCount",
    "samplesFile",
    "samplesHash",
]);

// Strict per-field shape check for one manifest mode entry — every numeric field is checked against the exact
// invariant the Outcome Library Bundle format (and RoundArtifact) itself already requires: outcomeCount/
// totalWeight/sample weight are positive safe integers (this bundle format's own weighted-draw path requires
// exact integer weights — see OutcomeLibraryBundleReader.drawOutcome), stake is a finite number strictly greater
// than zero (RoundArtifact's own invariant) — and no field beyond these twelve is ever accepted.
export function isModeEntryShape(value: unknown): value is CertificationEvidenceBundleModeEntry {
    if (typeof value !== "object" || value === null || !hasOnlyAllowedKeys(value, MODE_ENTRY_KEYS)) {
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

const MANIFEST_KEYS = new Set([
    "schemaVersion",
    "generatedBy",
    "pokieVersion",
    "generatedAt",
    "game",
    "configHash",
    "artifactPokieVersion",
    "sourceBundleDir",
    "sourceBundleManifestHash",
    "modes",
    "deepValidation",
    "files",
    "evidenceContentHash",
]);

// Top-level shape check only — does NOT deeply validate every "modes" entry (use isModeEntryShape per entry) or
// every "files" entry; callers that need per-element correctness check those separately, so a single malformed
// mode/sample/file never has to invalidate an otherwise well-formed manifest's other entries.
export function isManifestShape(value: unknown): value is CertificationEvidenceBundleManifest {
    if (typeof value !== "object" || value === null || !hasOnlyAllowedKeys(value, MANIFEST_KEYS)) {
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

const SAMPLE_RECORD_KEYS = new Set(["modeName", "sampleIndex", "seed", "outcomeId", "weight", "recordHash", "artifactHash", "artifact"]);

export function isSampleRecordShape(value: unknown): value is CertificationEvidenceSampleRecord {
    if (typeof value !== "object" || value === null || !hasOnlyAllowedKeys(value, SAMPLE_RECORD_KEYS)) {
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
