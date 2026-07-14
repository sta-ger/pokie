// Thrown by buildWeightedOutcomeLibrary when given input that can never produce a valid WeightedOutcomeLibrary —
// an invalid libraryId/schemaVersion, an empty outcomes list, an invalid/duplicate outcome id, an invalid
// weight or artifact.payoutMultiplier, a total weight of zero, or content that isn't JSON-safe (see
// toCanonicalJson) — so a caller finds out immediately, with a specific reason, instead of getting back a
// library that only fails later at hash/projection/analysis time or silently fails
// WeightedOutcomeLibraryValidator. "code" mirrors the matching ValidationIssue code where one exists (e.g.
// "weighted-outcome-library-outcomes-empty"), same convention as RoundArtifactBuildError.
export class WeightedOutcomeLibraryBuildError extends Error {
    private readonly code: string;

    constructor(code: string, message: string) {
        super(message);
        this.name = "WeightedOutcomeLibraryBuildError";
        this.code = code;
    }

    public getCode(): string {
        return this.code;
    }
}
