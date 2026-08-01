// Thrown by ProjectTargetResolver.resolve() when a target's on-disk shape is an ordinary WASM binary — POKIE
// reserves the "wasm" ProjectType for a future export target (see ProjectType.ts's own "wasm" doc comment),
// but has no versioned export contract yet to recognize a .wasm file against. This is deliberately distinct
// from an ordinary non-match (which resolve() reports as `undefined`, never an error — see ProjectResolving's
// own doc comment): a caller pointing POKIE at a .wasm file has a specific, actionable target in mind, so
// resolve() explains why it can't be used yet instead of silently reporting it as unrecognized, the same
// "a dedicated Error subclass per specific failure" naming convention ProjectTargetAmbiguousError uses.
export class ProjectTargetUnsupportedError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "ProjectTargetUnsupportedError";
    }
}
