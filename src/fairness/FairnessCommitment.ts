// Tracks this type's own shape (not the pokie package version), same convention as
// OUTCOME_LIBRARY_BUNDLE_MANIFEST_SCHEMA_VERSION.
export const FAIRNESS_COMMITMENT_SCHEMA_VERSION = 1;

// The "round commitment" — published to the player once clientSeed/nonce are known and BEFORE the outcome is
// selected, pinning everything the eventual deterministic draw depends on: clientSeed/nonce/libraryId/
// libraryHash/modeName, plus serverSeedHash carried forward unchanged from an already-published
// FairnessServerSeedCommitment (see that type's own doc comment, and computeFairnessCommitment, the one place
// this type is built — it never accepts a raw serverSeed, only that earlier commitment).
//
// What this type does NOT prove by itself: that serverSeedHash was published *before* clientSeed/nonce were
// known. That guarantee comes entirely from the earlier FairnessServerSeedCommitment step being genuinely
// published first — this type only carries the resulting hash forward. Treat "commitment" here as pinning the
// round's own inputs before selection, not as evidence of serverSeed's own publication order; a caller wanting
// that timing to be independently checkable needs its own commitment log or timestamping authority, out of
// scope for this library.
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
