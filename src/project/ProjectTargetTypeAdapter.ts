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
// signal matched (see PokieProject's own "provenance" field) when it does, or undefined when it doesn't —
// never throws for a merely-malformed or unrelated target; a file/directory that superficially could be this
// type but fails a deeper read (invalid JSON, a corrupt workbook, a missing required field) is simply not
// recognized, same as one that never looked like this type at all.
export interface ProjectTargetTypeAdapter {
    readonly type: ProjectType;
    readonly targetKind: ProjectTargetKind;
    recognize(resolvedPath: string): Promise<string | undefined>;
}
