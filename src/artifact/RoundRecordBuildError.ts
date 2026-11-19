// Thrown by buildRoundRecord/buildRoundStepRecord when given input that can never produce a valid
// RoundRecord — an empty steps list, an invalid roundId/betMode/stake/schemaVersion, a non-finite/negative
// win amount, or content that isn't JSON-safe (see toCanonicalJson) — so a caller finds out immediately, with
// a specific reason, instead of getting back a RoundRecord that only fails later at hash/projection time or
// silently fails RoundRecordValidator. "code" mirrors the matching ValidationIssue code where one exists
// (e.g. "round-record-steps-empty"), so build-time failures and post-hoc validation share one vocabulary.
export class RoundRecordBuildError extends Error {
    private readonly code: string;

    constructor(code: string, message: string) {
        super(message);
        this.name = "RoundRecordBuildError";
        this.code = code;
    }

    public getCode(): string {
        return this.code;
    }
}
