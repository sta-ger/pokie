// Thrown by an ArtifactBuilder.build() implementation when its own destinationPath already holds content that
// build doesn't itself own/manage -- the build-direction counterpart to ProjectTargetAmbiguousError/
// ProjectTargetUnsupportedError/ProjectTargetMalformedError's "a dedicated Error subclass per specific
// failure" naming convention. Every concrete per-target writer POKIE already has (GamePackageGenerator,
// OutcomeLibraryBundleWriter, StakeEngineExporter, ParSheetExporter) already refuses to silently overwrite
// unrecognized content today, each with its own message/shape; a future ArtifactBuilder implementation
// wrapping one of them should translate that writer's own conflict signal into this error rather than
// inventing a second, inconsistent shape per target.
export class ArtifactBuildConflictError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "ArtifactBuildConflictError";
    }
}
