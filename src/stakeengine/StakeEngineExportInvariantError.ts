// Thrown only by StakeEngineExporter's own internal self-check: every lookup CSV row's payoutMultiplier must
// exactly match the corresponding book line's payoutMultiplier, since both are derived from the very same
// outcome's artifact.payoutMultiplier in the same pass. Should be unreachable in practice — a genuine mismatch
// would mean the exporter's own CSV/book construction diverged from itself, not a caller input problem (those
// are always reported as ValidationIssue[] instead, see StakeEngineExportValidator) — so this is a defensive
// invariant guard, not a validation outcome. Naming mirrors WeightedOutcomeLibraryBuildError/RoundArtifactBuildError.
export class StakeEngineExportInvariantError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "StakeEngineExportInvariantError";
    }
}
