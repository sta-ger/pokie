// Thrown only by drawPinnedFairnessOutcome's own internal drift check — never a caller-input problem, always
// translated by its two callers into their own public-facing signal (FairnessRoundProofBuilder throws
// FairnessRoundProofBuildError with a "fairness-round-proof-bundle-drift" code; FairnessRoundProofVerifier
// returns a "fairness-verify-bundle-drift" ValidationIssue instead), so this class itself never needs to be
// caught outside src/fairness/.
export class FairnessBundleDriftError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "FairnessBundleDriftError";
    }
}
