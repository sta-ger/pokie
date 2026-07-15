import {deepFreeze} from "../internal/deepFreeze.js";
import {FAIRNESS_COMMITMENT_SCHEMA_VERSION, type FairnessCommitment} from "./FairnessCommitment.js";
import {FairnessServerSeedCommitmentValidator} from "./FairnessServerSeedCommitmentValidator.js";
import type {FairnessServerSeedCommitment} from "./FairnessServerSeedCommitment.js";
import {isIsoTimestamp, isValidModeName} from "./internal/fairnessShapeGuards.js";

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
// here). Fails fast on a malformed serverSeedCommitment/clientSeed/nonce/libraryId/libraryHash/modeName/issuedAt,
// before any commitment is ever returned — the same "commitment integrity" a valid
// FairnessRoundProof.serverSeedHash later re-derives and cross-checks (see FairnessRoundProofValidator), now
// paired with the strict, closed-shape checks FairnessCommitmentValidator applies to the object this function
// returns.
//
// serverSeedCommitment is validated via FairnessServerSeedCommitmentValidator — the same mandatory, non-
// overridable check FairnessRoundProofBuilder itself always runs against a commitment before building against
// it — never just an ad-hoc field-presence check that could silently drift from what that validator actually
// enforces.
export function computeFairnessCommitment(input: FairnessCommitmentInput): FairnessCommitment {
    const serverSeedCommitmentIssues = new FairnessServerSeedCommitmentValidator().validate(input.serverSeedCommitment);
    if (serverSeedCommitmentIssues.some((issue) => issue.severity === "error")) {
        throw new RangeError(`serverSeedCommitment does not validate: ${serverSeedCommitmentIssues.map((issue) => issue.code).join(", ")}.`);
    }
    const serverSeedCommitment = input.serverSeedCommitment;

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
    // The canonical bundle rule ([A-Za-z0-9_-]+ — see fairnessShapeGuards's own doc comment) rather than just
    // "non-empty": modeName ends up embedded in a filename (index_<modeName>.json, outcomes_<modeName>.jsonl)
    // the moment this commitment is built against — rejecting anything else here, at the earliest possible
    // point, means a "/", "..", or absolute-path modeName can never even reach that far.
    if (!isValidModeName(input.modeName)) {
        throw new RangeError(`modeName must be a non-empty string matching [A-Za-z0-9_-]+, got ${JSON.stringify(input.modeName)}.`);
    }
    // Rejected here, immediately, rather than silently carried into the returned commitment: a bad custom
    // issuedAt would otherwise produce an object that looks successfully built but fails
    // FairnessCommitmentValidating the moment anyone actually checks it — the same "fail fast, never return a
    // doomed artifact" discipline every other builder in this codebase follows.
    if (input.issuedAt !== undefined && !isIsoTimestamp(input.issuedAt)) {
        throw new RangeError(`issuedAt must be a valid canonical ISO timestamp (e.g. new Date().toISOString()), got ${JSON.stringify(input.issuedAt)}.`);
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
