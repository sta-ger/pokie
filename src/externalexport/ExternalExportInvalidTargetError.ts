// Thrown by ExternalExportTargetRegistry.register() when a target fails
// ExternalExportTargetDescriptorValidator (an invalid/empty id or version, malformed requirements, non-unique
// capabilities, or a missing required projector/generator/validator/diagnostic/runtimeAdapter method) — a
// distinct error from ExternalExportDuplicateTargetError, which is only ever about a *valid* descriptor
// colliding with one already registered. Naming mirrors that class and RoundRecordBuildError/
// StakeEngineExportInvariantError: a dedicated Error subclass per specific failure, not a generic Error.
export class ExternalExportInvalidTargetError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "ExternalExportInvalidTargetError";
    }
}
