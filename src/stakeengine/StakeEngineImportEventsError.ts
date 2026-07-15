// Thrown by StakeEngineRoundEventsImporter.importEvents when a book line's events aren't the exact shape/order
// StakeEngineRoundEventsProjector always produces (missing/misplaced reveal or finalWin, an amount that isn't
// representable without hidden rounding, ...) — same shape/convention as RoundArtifactBuildError/
// WeightedOutcomeLibraryBuildError, so StakeEngineImporter can surface `getCode()` directly as a ValidationIssue
// code rather than inventing a second error taxonomy.
export class StakeEngineImportEventsError extends Error {
    private readonly code: string;

    constructor(code: string, message: string) {
        super(message);
        this.name = "StakeEngineImportEventsError";
        this.code = code;
    }

    public getCode(): string {
        return this.code;
    }
}
