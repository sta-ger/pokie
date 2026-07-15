// Tracks this type's own shape (not the pokie package version), same convention as
// OUTCOME_LIBRARY_BUNDLE_MANIFEST_SCHEMA_VERSION.
export const FAIRNESS_COMMITMENT_SCHEMA_VERSION = 1;

// Published to the player BEFORE any outcome is selected — the "commit" half of a commit-reveal provably fair
// scheme. Carries only serverSeedHash (sha256 of the still-secret serverSeed, see computeFairnessCommitment),
// never the serverSeed itself: a player who later receives the matching, revealed FairnessRoundProof can check
// that proof's own serverSeed hashes to exactly this value, proving the server couldn't have picked serverSeed
// *after* seeing clientSeed/nonce and choosing whichever one happened to produce a favorable outcome.
// clientSeed/nonce/libraryId/libraryHash/modeName are already fixed here too — everything the eventual
// deterministic draw depends on except the one thing still secret at commitment time.
export type FairnessCommitment = {
    readonly schemaVersion: number;
    readonly algorithmVersion: string;
    readonly serverSeedHash: string; // sha256:<hex> of the still-secret serverSeed
    readonly clientSeed: string;
    readonly nonce: number;
    readonly libraryId: string;
    readonly libraryHash: string; // computeWeightedOutcomeLibraryHash of the pinned mode's own library
    readonly modeName: string;
    readonly issuedAt: string;
};
