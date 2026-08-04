// Which family of canonical outcome source a CanonicalOutcomeSourceDescriptor describes — "native" for a
// POKIE-built outcome-library bundle (see weightedoutcome/bundle/OutcomeLibraryBundleReading), "stakeEngine"
// for an arbitrary Stake Engine outcome directory (see stakeengine/standalone/StakeEngineOutcomeSourceReading).
// Deliberately a closed union: every reader this contract exists for is already known, unlike ProjectCapability's
// own open-string vocabulary.
export type CanonicalOutcomeSourceKind = "native" | "stakeEngine";

// What a caller needs to honestly present a canonical outcome source to a user (a Studio "Outcome library"
// project's own Overview panel, a CLI "inspect" summary) before reading anything else off it — the same
// "explicit metadata/limitations, never inferred" discipline ArtifactBuildTargetDescriptor's own
// "unsupportedNotes" field already follows for build targets, applied here to outcome *sources* instead.
//
// `streaming` is true only when the reader can serve a single outcome (by id, or by weighted draw) without ever
// loading every other outcome in the same mode into memory at once — true for a native outcome-library bundle
// (its own per-mode index + byte-range read, see OutcomeLibraryBundleReading), false for a Stake Engine outcome
// directory (StakeEngineOutcomeSourceReader reads a whole mode's lookup CSV and books into memory in one pass —
// see its own doc comment).
//
// `limitations` states, in prose, what this source's own reader deliberately never does — e.g. that it never
// reconstructs the game model/blueprint that produced its outcomes — so a caller never has to infer a source's
// own boundaries from an absence of behavior.
export type CanonicalOutcomeSourceDescriptor = {
    readonly kind: CanonicalOutcomeSourceKind;
    readonly streaming: boolean;
    readonly limitations: readonly string[];
};
