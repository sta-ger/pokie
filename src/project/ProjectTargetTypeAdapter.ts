import type {ProjectType} from "./ProjectType.js";

// Whether an adapter recognizes a file or a directory — ProjectTargetResolver only ever calls an adapter
// against a target whose own fs.Stats already agrees with this, so an adapter's recognize() never has to
// re-check "is this even a file/directory" itself.
export type ProjectTargetKind = "file" | "directory";

// One per-ProjectType recognizer, registered into ProjectTargetResolver (see its own default adapter list).
// Each adapter owns exactly one ProjectType and answers exactly one question: "does the on-disk shape at this
// already-resolved, already-stat'd path match my type" — never "resolve this path to a PokieProject" (that
// remains ProjectTargetResolver's own job: stamping capabilities, and refusing to guess when more than one
// adapter answers yes). recognize() returns a human-readable provenance string describing *which* on-disk
// signal matched (see PokieProject's own "provenance" field) when it does, or undefined when it doesn't. A
// target that never looked like this type at all (no trace of the manifest/shape this adapter keys off) is
// simply not recognized, same as one that superficially could be this type but turns out not to be. But a
// target whose own manifest already signals intent to be this exact type — e.g. a package.json declaring a
// "pokie" field, or a manifest.json declaring a "schemaVersion" — and then fails a deeper read (invalid JSON,
// a missing required field) is a different case: recognize() throws ProjectTargetMalformedError for that one
// instead of reporting undefined, so a caller learns their target was recognized-but-broken rather than
// mistaking it for an unrelated path (see that class's own doc comment; TsPackageProjectTargetAdapter/
// OutcomeLibraryProjectTargetAdapter are the adapters that draw this distinction today).
export interface ProjectTargetTypeAdapter {
    readonly type: ProjectType;
    readonly targetKind: ProjectTargetKind;
    recognize(resolvedPath: string): Promise<string | undefined>;
}
