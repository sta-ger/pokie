// Thrown by ProjectTargetResolver.resolve() when a target carries the manifest a specific ProjectType adapter
// keys its recognition off (e.g. a directory's "package.json" declaring a "pokie" field, or an outcome-library
// bundle's "manifest.json" declaring a "schemaVersion"), but that manifest fails to parse as JSON or doesn't
// satisfy that type's required shape. This is deliberately distinct from an ordinary non-match (which
// resolve() reports as `undefined`, never an error — see ProjectResolving's own doc comment): a manifest that
// already signals "I am trying to be this ProjectType" and gets the shape wrong is a target-specific defect
// worth surfacing loudly, not indistinguishable from a path that never claimed to be this type at all — the
// same "a dedicated Error subclass per specific failure" naming convention ProjectTargetAmbiguousError/
// ProjectTargetUnsupportedError use.
export class ProjectTargetMalformedError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "ProjectTargetMalformedError";
    }
}
