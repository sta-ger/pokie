import {deepFreeze} from "../internal/deepFreeze.js";
import {POKIE_FAIRNESS_ALGORITHM_VERSION} from "./FairnessAlgorithmVersion.js";
import {FAIRNESS_COMMITMENT_SCHEMA_VERSION, type FairnessCommitment} from "./FairnessCommitment.js";
import {sha256OfBytes} from "./internal/sha256OfBytes.js";

export type FairnessCommitmentInput = {
    // Stays secret — read here exactly once to compute its own hash, and never stored on the returned
    // commitment. This package never generates a serverSeed itself, the same "caller owns entropy" split
    // SecureWeightedOutcomeRandomSource/SeededWeightedOutcomeRandomSource already have with their own random
    // sources — a caller typically draws it via crypto.randomBytes(32).toString("hex") and holds onto it
    // server-side until the round is revealed (see FairnessRoundProofBuilder.build).
    readonly serverSeed: string;
    readonly clientSeed: string;
    readonly nonce: number;
    readonly libraryId: string;
    readonly libraryHash: string;
    readonly modeName: string;
    readonly issuedAt?: string;
};

// The one place a FairnessCommitment is built — always from a caller-supplied serverSeed, reduced immediately to
// its own serverSeedHash via the shared sha256:<hex> convention (see computeWeightedOutcomeLibraryHash). Fails
// fast on a malformed serverSeed/clientSeed/nonce, before any commitment is ever returned — the same
// "commitment integrity" a valid FairnessRoundProof.serverSeedHash later re-derives and cross-checks (see
// FairnessRoundProofValidator).
export function computeFairnessCommitment(input: FairnessCommitmentInput): FairnessCommitment {
    if (typeof input.serverSeed !== "string" || input.serverSeed.length === 0) {
        throw new RangeError("serverSeed must be a non-empty string.");
    }
    if (typeof input.clientSeed !== "string" || input.clientSeed.length === 0) {
        throw new RangeError("clientSeed must be a non-empty string.");
    }
    if (!Number.isSafeInteger(input.nonce) || input.nonce < 0) {
        throw new RangeError(`nonce must be a non-negative safe integer, got ${input.nonce}.`);
    }
    if (typeof input.libraryId !== "string" || input.libraryId.length === 0) {
        throw new RangeError("libraryId must be a non-empty string.");
    }
    if (typeof input.libraryHash !== "string" || input.libraryHash.length === 0) {
        throw new RangeError("libraryHash must be a non-empty string.");
    }
    if (typeof input.modeName !== "string" || input.modeName.length === 0) {
        throw new RangeError("modeName must be a non-empty string.");
    }

    return deepFreeze({
        schemaVersion: FAIRNESS_COMMITMENT_SCHEMA_VERSION,
        algorithmVersion: POKIE_FAIRNESS_ALGORITHM_VERSION,
        serverSeedHash: sha256OfBytes(input.serverSeed),
        clientSeed: input.clientSeed,
        nonce: input.nonce,
        libraryId: input.libraryId,
        libraryHash: input.libraryHash,
        modeName: input.modeName,
        issuedAt: input.issuedAt ?? new Date().toISOString(),
    });
}
