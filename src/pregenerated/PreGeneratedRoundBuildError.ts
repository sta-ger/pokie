// Thrown by buildPreGeneratedRoundResult when given input that can never produce a valid
// PreGeneratedRoundResult — an outcome not actually present in the given library, an invalid
// roundId/sessionId, a non-finite balance, a malformed transaction entry, or content that isn't
// JSON-safe. "code" mirrors the matching ValidationIssue code where one exists, same convention as
// RoundArtifactBuildError/WeightedOutcomeLibraryBuildError.
export class PreGeneratedRoundBuildError extends Error {
    private readonly code: string;

    constructor(code: string, message: string) {
        super(message);
        this.name = "PreGeneratedRoundBuildError";
        this.code = code;
    }

    public getCode(): string {
        return this.code;
    }
}
