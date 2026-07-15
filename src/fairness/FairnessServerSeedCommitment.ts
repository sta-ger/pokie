// Tracks this type's own shape (not the pokie package version), same convention as
// FAIRNESS_COMMITMENT_SCHEMA_VERSION.
export const FAIRNESS_SERVER_SEED_COMMITMENT_SCHEMA_VERSION = 1;

// The one artifact that must be published BEFORE a player's clientSeed/nonce are even solicited — the actual
// "commit" a commit-reveal scheme depends on. Deliberately carries nothing beyond serverSeedHash itself: no
// clientSeed, no nonce, no libraryId/modeName, nothing that could tempt an implementation into computing this
// value at the same moment those are already known (see FairnessCommitment's own doc comment for why that would
// undermine the whole point). computeFairnessCommitment always takes one of these as an input — never a raw
// serverSeed directly — so a round commitment can only ever carry forward a serverSeedHash that already exists
// as its own, independently publishable object.
//
// This type — and computeFairnessServerSeedCommitment, the one place it's built — cannot by itself prove *when*
// it was published relative to a later FairnessCommitment; that requires an external commitment log or
// timestamping authority, out of scope for this library. What it does provide is the structural shape that
// makes publishing it first the natural, unforced way to use this API at all.
export type FairnessServerSeedCommitment = {
    readonly schemaVersion: number;
    readonly algorithmVersion: string;
    readonly serverSeedHash: string; // sha256:<hex> of the still-secret serverSeed
    readonly issuedAt: string;
};
