// How the Outcome Libraries tab locates a library to load, one of three supported sources:
// - "json": a plain WeightedOutcomeLibrary JSON file, resolved relative to the project root (the same
//   file shape the Deployment tab's own per-mode libraryPath already reads — see
//   loadWeightedOutcomeLibraryFromProjectFile).
// - "bundle": one mode of a canonical outcome-library bundle directory (see
//   src/weightedoutcome/bundle/OutcomeLibraryBundleReader).
// - "stakeengine": one mode of a directory `pokie stakeengine export` itself produced (see
//   src/stakeengine/StakeEngineImporter) -- the only "external outcome library" format this round-trips.
export type OutcomeLibrarySelector =
    | {readonly kind: "json"; readonly path: string}
    | {readonly kind: "bundle"; readonly bundleDir: string; readonly modeName: string}
    | {readonly kind: "stakeengine"; readonly stakeDir: string; readonly modeName: string};
