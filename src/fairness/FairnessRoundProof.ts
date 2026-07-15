// Tracks this type's own shape (not the pokie package version), same convention as
// FAIRNESS_COMMITMENT_SCHEMA_VERSION.
export const FAIRNESS_ROUND_PROOF_SCHEMA_VERSION = 1;

// Published to the player AFTER the round is settled — the "reveal" half of the commit-reveal scheme
// FairnessCommitment starts (see that type's own doc comment). Carries its own copy of every field the
// commitment pinned (clientSeed/nonce/libraryId/libraryHash/modeName/serverSeedHash), so a self-consistency
// check (FairnessRoundProofValidating — does the revealed serverSeed hash to serverSeedHash) never needs the
// original commitment back. Full verification against a live bundle, however, always requires it: commitmentHash
// binds this exact proof to one exact FairnessCommitment object, and FairnessRoundProofVerifying refuses to
// cross-check a proof against a bundle without the matching commitment also being given (see that type's own
// doc comment for why a proof's own internal consistency alone can never substitute for it).
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
    readonly commitmentHash: string; // computeFairnessCommitmentHash of the exact FairnessCommitment this round was built from
    readonly revealedAt: string;
};
