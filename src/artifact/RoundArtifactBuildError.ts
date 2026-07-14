// Thrown by buildRoundArtifact/buildRoundStepArtifact when given input that can never produce a valid
// RoundArtifact — an empty steps list, an invalid roundId/betMode/stake/schemaVersion, a non-finite/negative
// win amount, or content that isn't JSON-safe (see toCanonicalJson) — so a caller finds out immediately, with
// a specific reason, instead of getting back a RoundArtifact that only fails later at hash/projection time or
// silently fails RoundArtifactValidator. "code" mirrors the matching ValidationIssue code where one exists
// (e.g. "round-artifact-steps-empty"), so build-time failures and post-hoc validation share one vocabulary.
export class RoundArtifactBuildError extends Error {
    private readonly code: string;

    constructor(code: string, message: string) {
        super(message);
        this.name = "RoundArtifactBuildError";
        this.code = code;
    }

    public getCode(): string {
        return this.code;
    }
}
