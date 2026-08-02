// Thrown by ProjectTargetResolver.resolve() when a target's on-disk shape matches more than one registered
// ProjectTargetTypeAdapter — e.g. a directory that somehow satisfies both the tsPackage and outcomeLibrary
// adapters at once. This is deliberately distinct from an ordinary non-match (which resolve() reports as
// `undefined`, never an error — see ProjectResolving's own doc comment): an ambiguous match means two adapters
// disagree about what the same path *is*, which is a registration/recognition conflict worth surfacing loudly
// rather than silently guessing one winner, the same "a dedicated Error subclass per specific failure" naming
// convention ExternalDeploymentInvalidTargetError/ExternalDeploymentDuplicateTargetError use.
export class ProjectTargetAmbiguousError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "ProjectTargetAmbiguousError";
    }
}
