// Thrown only by validatePinnedFairnessModeIndex — a mode index (read straight off disk, with no runtime shape
// guarantee of its own: OutcomeLibraryBundleReader.readModeIndex is a raw JSON.parse + type-cast) that isn't
// trustworthy enough to select or read an outcome against. Never a caller-input problem in the ordinary sense
// (the caller only ever supplies a modeName/sourceBundleDir — see FairnessModeIndexInvalidError's own use for the
// modeName-pattern check, which IS a caller-input problem, thrown before any file is ever read); always
// translated by drawPinnedFairnessOutcome's two callers into their own public-facing signal
// (FairnessRoundProofBuilder throws FairnessRoundProofBuildError with a "fairness-round-proof-mode-index-invalid"
// code; FairnessRoundProofVerifier returns a "fairness-verify-mode-index-invalid" ValidationIssue instead), so
// this class itself never needs to be caught outside src/fairness/.
export class FairnessModeIndexInvalidError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "FairnessModeIndexInvalidError";
    }
}
