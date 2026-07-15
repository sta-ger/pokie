import {isPositiveSafeInteger} from "../../pregenerated/internal/isPositiveSafeInteger.js";
import type {FairnessCommitment} from "../FairnessCommitment.js";
import type {FairnessRoundProof} from "../FairnessRoundProof.js";

// Shared, deliberately strict runtime shape guards for a candidate (possibly hand-crafted, possibly tampered)
// FairnessCommitment/FairnessRoundProof — used by FairnessCommitmentValidator and FairnessRoundProofValidator
// respectively, so the two can never silently disagree on what counts as "a well-formed commitment/proof". Same
// "one shared guards file per bundle format" discipline certificationEvidenceBundleShapeGuards already follows.
//
// Every guard below is *closed*: it rejects an object carrying any key beyond the ones its own schema actually
// defines, not just one missing a required key or holding a wrong-typed value — an object with an extra,
// unexpected field is exactly as invalid as one missing a required field. This matters because every
// content-level check downstream (computeFairnessCommitmentHash/computeFairnessRoundProofHash/
// computeFairnessIndexHash comparisons) only ever looks at fields these guards already know about, so an
// unknown, smuggled-in field would otherwise be invisible to all of them.

const SHA256_HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;

const FAIRNESS_COMMITMENT_KEYS = new Set([
    "schemaVersion",
    "algorithmVersion",
    "serverSeedHash",
    "clientSeed",
    "nonce",
    "libraryId",
    "libraryHash",
    "modeName",
    "issuedAt",
]);

const FAIRNESS_ROUND_PROOF_KEYS = new Set([
    "schemaVersion",
    "algorithmVersion",
    "serverSeed",
    "serverSeedHash",
    "clientSeed",
    "nonce",
    "libraryId",
    "libraryHash",
    "modeName",
    "indexHash",
    "outcomeId",
    "weight",
    "recordHash",
    "commitmentHash",
    "revealedAt",
]);

function hasOnlyAllowedKeys(value: object, allowedKeys: ReadonlySet<string>): boolean {
    return Object.keys(value).every((key) => allowedKeys.has(key));
}

export function isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
}

export function isNonNegativeSafeInteger(value: unknown): value is number {
    return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

export function isValidSha256Hash(value: unknown): value is string {
    return typeof value === "string" && SHA256_HASH_PATTERN.test(value);
}

// Strict — not just "anything Date.parse can make sense of" (which also accepts non-ISO, locale-dependent, and
// otherwise ambiguous formats): a value only passes if re-serializing it as a Date reproduces the exact same
// string, i.e. it's already in the one canonical form `Date.prototype.toISOString()` itself produces.
export function isIsoTimestamp(value: unknown): value is string {
    if (typeof value !== "string") {
        return false;
    }
    const parsed = new Date(value);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}

export {isPositiveSafeInteger};

export function isFairnessCommitmentShape(value: unknown): value is FairnessCommitment {
    if (typeof value !== "object" || value === null || !hasOnlyAllowedKeys(value, FAIRNESS_COMMITMENT_KEYS)) {
        return false;
    }
    const commitment = value as Record<string, unknown>;
    return (
        typeof commitment.schemaVersion === "number" &&
        isNonEmptyString(commitment.algorithmVersion) &&
        isValidSha256Hash(commitment.serverSeedHash) &&
        isNonEmptyString(commitment.clientSeed) &&
        isNonNegativeSafeInteger(commitment.nonce) &&
        isNonEmptyString(commitment.libraryId) &&
        isValidSha256Hash(commitment.libraryHash) &&
        isNonEmptyString(commitment.modeName) &&
        isIsoTimestamp(commitment.issuedAt)
    );
}

export function isFairnessRoundProofShape(value: unknown): value is FairnessRoundProof {
    if (typeof value !== "object" || value === null || !hasOnlyAllowedKeys(value, FAIRNESS_ROUND_PROOF_KEYS)) {
        return false;
    }
    const proof = value as Record<string, unknown>;
    return (
        typeof proof.schemaVersion === "number" &&
        isNonEmptyString(proof.algorithmVersion) &&
        isNonEmptyString(proof.serverSeed) &&
        isValidSha256Hash(proof.serverSeedHash) &&
        isNonEmptyString(proof.clientSeed) &&
        isNonNegativeSafeInteger(proof.nonce) &&
        isNonEmptyString(proof.libraryId) &&
        isValidSha256Hash(proof.libraryHash) &&
        isNonEmptyString(proof.modeName) &&
        isValidSha256Hash(proof.indexHash) &&
        isNonEmptyString(proof.outcomeId) &&
        isPositiveSafeInteger(proof.weight) &&
        isValidSha256Hash(proof.recordHash) &&
        isValidSha256Hash(proof.commitmentHash) &&
        isIsoTimestamp(proof.revealedAt)
    );
}
