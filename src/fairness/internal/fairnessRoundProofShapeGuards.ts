import {isPositiveSafeInteger} from "../../pregenerated/internal/isPositiveSafeInteger.js";
import type {FairnessRoundProof} from "../FairnessRoundProof.js";

const SHA256_HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;

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

export {isPositiveSafeInteger};

// A deliberately closed shape guard — a candidate carrying any key beyond the ones FairnessRoundProof actually
// defines is exactly as invalid as one missing a required key (same discipline as
// certificationEvidenceBundleShapeGuards's own guards): every content-level check downstream
// (computeFairnessIndexHash comparison, sha256OfBytes(serverSeed) comparison) only ever looks at fields this
// guard already knows about, so an unknown, smuggled-in field would otherwise be invisible to all of them.
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
        isNonEmptyString(proof.revealedAt)
    );
}
