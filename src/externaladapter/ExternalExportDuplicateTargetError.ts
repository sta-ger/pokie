// Thrown by ExternalExportTargetRegistry.register() when a target's own "id" is already registered —
// exactly, or only differing by case (see the class's own doc comment for why a case-only collision is refused
// too). Naming mirrors StakeEngineExportInvariantError/RoundRecordBuildError: a dedicated Error subclass per
// package, rather than a generic Error, so a caller can distinguish this specific failure with instanceof.
export class ExternalExportDuplicateTargetError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "ExternalExportDuplicateTargetError";
    }
}
