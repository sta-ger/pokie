// Thrown by ExternalDeploymentTargetRegistry.register() when a target fails
// ExternalDeploymentTargetDescriptorValidator (an invalid/empty id or version, malformed requirements, non-unique
// capabilities, or a missing required projector/generator/validator/diagnostic/runtimeAdapter method) — a
// distinct error from ExternalDeploymentDuplicateTargetError, which is only ever about a *valid* descriptor
// colliding with one already registered. Naming mirrors that class and RoundArtifactBuildError/
// StakeEngineExportInvariantError: a dedicated Error subclass per specific failure, not a generic Error.
export class ExternalDeploymentInvalidTargetError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "ExternalDeploymentInvalidTargetError";
    }
}
