// Thrown only by OutcomeLibraryBundleWriter/OutcomeLibraryBundleReader's own internal self-checks — conditions
// that should be unreachable given validation already ran (e.g. a mode's outcomes array turning out empty after
// WeightedOutcomeLibraryValidator already confirmed it wasn't). A genuine caller-input problem is always
// reported as a ValidationIssue instead (see OutcomeLibraryBundleWriteValidator/OutcomeLibraryBundleValidator) —
// this is a defensive invariant guard, not a validation outcome. Naming mirrors StakeEngineExportInvariantError/
// StakeEngineImportInvariantError.
export class OutcomeLibraryBundleInvariantError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "OutcomeLibraryBundleInvariantError";
    }
}
