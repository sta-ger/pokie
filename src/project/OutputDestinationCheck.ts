// What BuildOutputBuilderRegistry.checkDestination() reports: whether a destination is available for a given
// target's own build() to write to, without ever invoking build() itself -- the same "file"/"directory"
// missing-or-empty precondition assertArtifactDestinationAvailable() enforces, off the same
// BuildOutputBuilder.destinationKind build() itself uses, surfaced as a plain result instead of a thrown
// BuildConflictError so a caller (a Studio build-preview panel) can report the identical conflict a
// real build would hit before ever attempting one.
export type OutputDestinationCheck = {readonly available: true} | {readonly available: false; readonly message: string};
