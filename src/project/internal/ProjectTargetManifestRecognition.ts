// The three-way outcome a manifest-keyed recognition helper (isPokieTsPackageDirectory,
// isOutcomeLibraryBundleDirectory) reports back to its adapter — a plain boolean can't distinguish "this
// target never claimed to be my type" from "this target's own manifest signals it's trying to be my type but
// gets the shape wrong", and the two now behave differently: TsPackageProjectTargetAdapter/
// OutcomeLibraryProjectTargetAdapter report "unrelated" as a normal non-match (recognize() resolves undefined)
// but "malformed" as a ProjectTargetMalformedError (recognize() throws) — see that class's own doc comment.
export type ProjectTargetManifestRecognition =
    | {readonly kind: "recognized"}
    | {readonly kind: "unrelated"}
    | {readonly kind: "malformed"; readonly reason: string};
