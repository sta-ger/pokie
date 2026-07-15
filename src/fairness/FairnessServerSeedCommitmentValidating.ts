import type {ValidationIssue} from "../validation/ValidationIssue.js";

// Strict, self-contained validation of a candidate FairnessServerSeedCommitment — closed shape (an extra,
// unexpected field is exactly as invalid as a missing one), current schema/algorithm versions, a valid
// sha256:<hex> serverSeedHash, and a valid canonical ISO timestamp. Used by computeFairnessCommitment to reject
// a malformed serverSeedCommitment input before ever carrying its fields forward into a round commitment — the
// same "never trust an input blindly" discipline FairnessCommitmentValidating/FairnessRoundProofValidating apply
// to their own candidates.
export interface FairnessServerSeedCommitmentValidating {
    validate(candidate: unknown): ValidationIssue[];
}
