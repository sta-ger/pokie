import {deepFreeze} from "../internal/deepFreeze.js";
import {FAIRNESS_COMMITMENT_SCHEMA_VERSION, type FairnessCommitment} from "./FairnessCommitment.js";
import type {FairnessServerSeedCommitment} from "./FairnessServerSeedCommitment.js";

export type FairnessCommitmentInput = {
    // The already-published server-seed commitment this round commitment carries forward — never a raw
    // serverSeed (see FairnessServerSeedCommitment's own doc comment for why: this function's own signature is
    // what makes publishing that commitment first, before clientSeed/nonce are even known, the only way to use
    // this API at all).
    readonly serverSeedCommitment: FairnessServerSeedCommitment;
    readonly clientSeed: string;
    readonly nonce: number;
    readonly libraryId: string;
    readonly libraryHash: string;
    readonly modeName: string;
    readonly issuedAt?: string;
};

// The one place a FairnessCommitment is built — always from an already-published FairnessServerSeedCommitment,
// carrying its own serverSeedHash/algorithmVersion forward unchanged (never recomputed from a raw serverSeed
// here). Fails fast on a malformed serverSeedCommitment/clientSeed/nonce/libraryId/libraryHash/modeName, before
// any commitment is ever returned — the same "commitment integrity" a valid FairnessRoundProof.serverSeedHash
// later re-derives and cross-checks (see FairnessRoundProofValidator), now paired with the strict, closed-shape
// checks FairnessCommitmentValidator applies to the object this function returns.
export function computeFairnessCommitment(input: FairnessCommitmentInput): FairnessCommitment {
    const serverSeedCommitment = input.serverSeedCommitment;
    if (typeof serverSeedCommitment !== "object" || serverSeedCommitment === null) {
        throw new RangeError("serverSeedCommitment must be a FairnessServerSeedCommitment object.");
    }
    if (typeof serverSeedCommitment.serverSeedHash !== "string" || serverSeedCommitment.serverSeedHash.length === 0) {
        throw new RangeError("serverSeedCommitment.serverSeedHash must be a non-empty string.");
    }
    if (typeof serverSeedCommitment.algorithmVersion !== "string" || serverSeedCommitment.algorithmVersion.length === 0) {
        throw new RangeError("serverSeedCommitment.algorithmVersion must be a non-empty string.");
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
        algorithmVersion: serverSeedCommitment.algorithmVersion,
        serverSeedHash: serverSeedCommitment.serverSeedHash,
        clientSeed: input.clientSeed,
        nonce: input.nonce,
        libraryId: input.libraryId,
        libraryHash: input.libraryHash,
        modeName: input.modeName,
        issuedAt: input.issuedAt ?? new Date().toISOString(),
    });
}
