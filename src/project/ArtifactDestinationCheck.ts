// What ArtifactBuilderRegistry.checkDestination() reports: whether a destination is available for a given
// target's own build() to write to, without ever invoking build() itself -- the same "file"/"directory"
// missing-or-empty precondition assertArtifactDestinationAvailable() enforces, off the same
// ArtifactBuilder.destinationKind build() itself uses, surfaced as a plain result instead of a thrown
// ArtifactBuildConflictError so a caller (a Studio build-preview panel) can report the identical conflict a
// real build would hit before ever attempting one.
export type ArtifactDestinationCheck = {readonly available: true} | {readonly available: false; readonly message: string};
