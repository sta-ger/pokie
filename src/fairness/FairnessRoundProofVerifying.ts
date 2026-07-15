import type {ValidationIssue} from "../validation/ValidationIssue.js";

// "sourceBundleDir" is where the live source Outcome Library Bundle actually is — it must always be given
// explicitly. Without it, FairnessRoundProofVerifying.verify runs only the self-consistency check (see
// FairnessRoundProofValidating) plus a diagnostic, and reads nothing else; there is deliberately no fallback.
export type FairnessVerifyOptions = {
    readonly sourceBundleDir: string;
};

// Cross-checks a candidate FairnessRoundProof against the *live* source Outcome Library Bundle it claims to have
// been drawn from — the check FairnessRoundProofValidating deliberately can't do on its own. Composes
// FairnessRoundProofValidating's own self-consistency check first (a structurally broken or seed-invalid proof
// can't be meaningfully cross-checked against anything), then detects drift/tampering in three places:
// - the pinned libraryId/libraryHash/indexHash, at both whole-library and single-mode-index granularity
//   ("bundle drift" — an entry added, removed, reweighted, or reordered since this proof was built);
// - the drawn outcome's own weight/recordHash, read straight off the live index's own matching entry (a
//   substituted-but-individually-valid, still-existing outcome id);
// - the deterministic selection itself — reproducing the exact HMAC-SHA256 byte stream this proof's own
//   revealed serverSeed/clientSeed/nonce produce and redrawing against the live bundle's own pinned index (never
//   a second, differently-derived selection algorithm — see OutcomeLibraryBundleReading.drawOutcome) to confirm
//   it independently selects this exact outcome.
// No game/win calculation is ever involved: only id/weight/recordHash and the byte-range integrity
// OutcomeLibraryBundleReading.drawOutcome already checks on every read.
export interface FairnessRoundProofVerifying {
    verify(candidate: unknown, options?: FairnessVerifyOptions): Promise<ValidationIssue[]>;
}
