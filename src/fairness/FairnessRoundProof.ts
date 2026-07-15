// Tracks this type's own shape (not the pokie package version), same convention as
// FAIRNESS_COMMITMENT_SCHEMA_VERSION.
export const FAIRNESS_ROUND_PROOF_SCHEMA_VERSION = 1;

// Published to the player AFTER the round is settled — the "reveal" half of the commit-reveal scheme
// FairnessCommitment starts (see that type's own doc comment). Self-contained: everything
// FairnessRoundProofVerifying needs to reproduce the exact deterministic draw and check its result against a
// live Outcome Library Bundle, without ever needing the original FairnessCommitment object back — though
// serverSeedHash is still carried here too, so a verifier (or a player who kept the original commitment) can
// independently confirm this reveal's own serverSeed actually hashes to what was committed *before* the round
// was played, not chosen afterwards to favor a particular result.
export type FairnessRoundProof = {
    readonly schemaVersion: number;
    readonly algorithmVersion: string;
    readonly serverSeed: string; // revealed
    readonly serverSeedHash: string; // sha256:<hex> of serverSeed — must match what was committed pre-selection
    readonly clientSeed: string;
    readonly nonce: number;
    readonly libraryId: string;
    readonly libraryHash: string;
    readonly modeName: string;
    readonly indexHash: string; // computeFairnessIndexHash of the mode index this outcome was drawn from
    readonly outcomeId: string;
    readonly weight: number;
    readonly recordHash: string; // the drawn outcome's own OutcomeLibraryBundleIndexEntry.recordHash
    readonly revealedAt: string;
};
