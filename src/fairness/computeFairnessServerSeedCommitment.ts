import {deepFreeze} from "../internal/deepFreeze.js";
import {POKIE_FAIRNESS_ALGORITHM_VERSION} from "./FairnessAlgorithmVersion.js";
import {FAIRNESS_SERVER_SEED_COMMITMENT_SCHEMA_VERSION, type FairnessServerSeedCommitment} from "./FairnessServerSeedCommitment.js";
import {isIsoTimestamp} from "./internal/fairnessShapeGuards.js";
import {sha256OfBytes} from "./internal/sha256OfBytes.js";

export type FairnessServerSeedCommitmentInput = {
    // Stays secret — read here exactly once to compute its own hash, and never stored on the returned
    // commitment. This package never generates a serverSeed itself (the same "caller owns entropy" split
    // SecureWeightedOutcomeRandomSource/SeededWeightedOutcomeRandomSource already have) — a caller typically
    // draws it via crypto.randomBytes(32).toString("hex") and holds onto it server-side until the round is
    // revealed (see FairnessRoundProofBuilder.build).
    readonly serverSeed: string;
    readonly issuedAt?: string;
};

// The one place a FairnessServerSeedCommitment is built — the actual "commit" step of the scheme, meant to be
// published to the player immediately, before clientSeed/nonce are even solicited (see that type's own doc
// comment). computeFairnessCommitment always takes the result of this function as an input, never a raw
// serverSeed directly, so a round commitment's own serverSeedHash can only ever be one that was already
// published this way.
export function computeFairnessServerSeedCommitment(input: FairnessServerSeedCommitmentInput): FairnessServerSeedCommitment {
    if (typeof input.serverSeed !== "string" || input.serverSeed.length === 0) {
        throw new RangeError("serverSeed must be a non-empty string.");
    }
    // Rejected here, immediately, rather than silently carried into the returned commitment: a bad custom
    // issuedAt would otherwise produce an object that looks successfully built but fails
    // FairnessServerSeedCommitmentValidating the moment anyone actually checks it — the same "fail fast, never
    // return a doomed artifact" discipline every other builder in this codebase follows.
    if (input.issuedAt !== undefined && !isIsoTimestamp(input.issuedAt)) {
        throw new RangeError(`issuedAt must be a valid canonical ISO timestamp (e.g. new Date().toISOString()), got ${JSON.stringify(input.issuedAt)}.`);
    }

    return deepFreeze({
        schemaVersion: FAIRNESS_SERVER_SEED_COMMITMENT_SCHEMA_VERSION,
        algorithmVersion: POKIE_FAIRNESS_ALGORITHM_VERSION,
        serverSeedHash: sha256OfBytes(input.serverSeed),
        issuedAt: input.issuedAt ?? new Date().toISOString(),
    });
}
