// Thrown by FairnessRoundProofBuilder.build when a reveal can never produce a valid FairnessRoundProof — a
// revealed serverSeed that doesn't hash to its own commitment, or a live bundle whose mode no longer matches the
// commitment's own pinned libraryId/libraryHash. "code" mirrors the matching ValidationIssue code where one
// exists, same convention as WeightedOutcomeLibraryBuildError/PreGeneratedRoundBuildError.
export class FairnessRoundProofBuildError extends Error {
    private readonly code: string;

    constructor(code: string, message: string) {
        super(message);
        this.name = "FairnessRoundProofBuildError";
        this.code = code;
    }

    public getCode(): string {
        return this.code;
    }
}
