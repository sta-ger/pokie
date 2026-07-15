import type {ValidationIssue} from "../validation/ValidationIssue.js";

// "commitment" is the original FairnessCommitment this proof claims to have been built from — it must always be
// given explicitly (or, on the CLI, via "--commitment <commitment.json>"). Without it, full verification is
// impossible: a proof's own internal consistency (does its serverSeed hash to its own serverSeedHash) can be
// checked without a commitment, but confirming this proof is genuinely bound to a specific, previously-issued
// commitment — not merely a self-consistent forgery built around a fresh, unrelated serverSeed/clientSeed/nonce —
// requires the genuine article to compare against. There is deliberately no fallback: a proof carries its own
// copies of the fields a commitment would pin, but copies alone can't prove they match anything that was ever
// actually committed to.
//
// "sourceBundleDir" is where the live source Outcome Library Bundle actually is — also required for a bundle
// cross-check; without it, verify() runs only the commitment cross-check above and reads no bundle at all.
export type FairnessVerifyOptions = {
    readonly commitment?: unknown;
    readonly sourceBundleDir?: string;
};

// Cross-checks a candidate FairnessRoundProof two ways: against its own claimed FairnessCommitment, and against
// the *live* source Outcome Library Bundle it claims to have been drawn from. Composes
// FairnessRoundProofValidating's own self-consistency check first (a structurally broken or seed-invalid proof
// can't be meaningfully cross-checked against anything), then — given a commitment — FairnessCommitmentValidating
// (a malformed commitment can't be trusted either), then detects drift/tampering in:
// - the commitment binding itself: this proof's own commitmentHash against a freshly recomputed hash of the
//   given commitment, and an exact field-by-field comparison of algorithmVersion/serverSeedHash/clientSeed/
//   nonce/libraryId/libraryHash/modeName (a forged proof built around a fresh, self-consistent serverSeed/
//   serverSeedHash pair fails here even before any bundle is ever touched, since it was never bound to the
//   genuine commitment);
// - the pinned libraryId/libraryHash/indexHash, at both whole-library and single-mode-index granularity
//   ("bundle drift" — an entry added, removed, reweighted, or reordered since this proof was built);
// - the drawn outcome's own weight/recordHash, read straight off the live index's own matching entry (a
//   substituted-but-individually-valid, still-existing outcome id);
// - the deterministic selection itself — reproducing the exact HMAC-SHA256 byte stream this proof's own
//   revealed serverSeed/clientSeed/nonce produce and redrawing against one pinned snapshot of the live bundle
//   (see drawPinnedFairnessOutcome — never OutcomeLibraryBundleReading.drawOutcome directly, and never a second,
//   differently-derived selection algorithm) to confirm it independently selects this exact outcome.
// No game/win calculation is ever involved: only id/weight/recordHash and the byte-range integrity the pinned
// draw already verifies on its own single read.
export interface FairnessRoundProofVerifying {
    verify(candidate: unknown, options?: FairnessVerifyOptions): Promise<ValidationIssue[]>;
}
