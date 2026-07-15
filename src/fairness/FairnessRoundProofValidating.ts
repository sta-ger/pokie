import type {ValidationIssue} from "../validation/ValidationIssue.js";

// Self-consistency validation of a candidate FairnessRoundProof *by itself* — never needs the source Outcome
// Library Bundle it claims to have been drawn from (that cross-check, against a still-available bundle, is
// FairnessRoundProofVerifying's own job, composed on top of this one — see FairnessRoundProofVerifier). Checks
// only what a proof can prove about itself: does it match FairnessRoundProof's own shape, is its
// schemaVersion/algorithmVersion one this package actually supports, and — the one check unique to a
// commit-reveal scheme — does the revealed serverSeed actually hash to its own recorded serverSeedHash. An
// invalid or substituted seed, a malformed nonce, or an unsupported algorithm are all rejected here, without
// ever touching a bundle.
export interface FairnessRoundProofValidating {
    validate(candidate: unknown): ValidationIssue[];
}
