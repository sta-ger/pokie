import type {ValidationIssue} from "../validation/ValidationIssue.js";

// Strict, self-contained validation of a candidate FairnessCommitment — closed shape (an extra, unexpected field
// is exactly as invalid as a missing one), current schema/algorithm versions, valid sha256 hashes, non-empty
// clientSeed/libraryId/modeName, a non-negative safe nonce, and a valid ISO timestamp. Used both by
// FairnessRoundProofBuilder (a build always validates the commitment it's given before drawing anything) and by
// FairnessRoundProofVerifying (a commitment given to verify() is validated the same way before it's trusted for
// any cross-check) — the same commitment can never be judged well-formed by one and malformed by the other.
export interface FairnessCommitmentValidating {
    validate(candidate: unknown): ValidationIssue[];
}
