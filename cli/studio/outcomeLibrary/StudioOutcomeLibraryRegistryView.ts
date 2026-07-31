import type {OutcomeLibraryGenerationStrategy, PokieGameManifest} from "pokie";

export type StudioOutcomeLibraryRegistryModeEntry = {
    readonly modeName: string;
    readonly libraryId: string;
    readonly outcomeCount: number;
    readonly totalWeight: number;
    readonly rtp: number;
    readonly hash: string;
    // Only present for a mode this same package's own generate() step produced (see
    // OutcomeLibraryBundleModeInput.generator's own doc comment) -- absent for a mode a caller built from
    // some other outcome source (a hand-authored WeightedOutcomeLibrary JSON file, a streamed JSONL file).
    readonly strategy?: OutcomeLibraryGenerationStrategy;
    readonly generatedAt?: string;
};

// The Registry's own "does a compatible library already exist for this build?" answer -- "build" here is
// always the currently open project itself (Studio has exactly one build per project: `loadPokieGame(
// projectRoot)`, see StudioSimulationService's own identical packageRoot === projectRoot convention),
// checked against the one conventional bundle location Generate itself writes to
// (StudioOutcomeLibraryGenerateService.DEFAULT_BUNDLE_DIR).
export type StudioOutcomeLibraryRegistryView =
    // No bundle exists at the conventional location at all -- nothing has ever been generated for this
    // build. The Registry's own "Build" action (not "Rebuild") targets this case.
    | {readonly status: "ok"; readonly bundleDir: string; readonly buildStatus: "missing"}
    | {
          readonly status: "ok";
          readonly bundleDir: string;
          // "compatible": the bundle's own game id/version and the pokie release that computed its
          // outcomes both still match the currently loaded build exactly.
          // "stale": same game id, but a different game version or a different pokie release computed the
          // outcomes -- the build has moved on since this library was generated.
          // "wrong": the bundle belongs to an entirely different game id than the currently loaded build --
          // e.g. the conventional directory was populated by a different project.
          readonly buildStatus: "compatible" | "stale" | "wrong";
          readonly game: PokieGameManifest;
          readonly currentGame: PokieGameManifest;
          readonly configHash?: string;
          readonly artifactPokieVersion: string;
          readonly currentPokieVersion: string;
          readonly generatedAt: string;
          readonly modes: readonly StudioOutcomeLibraryRegistryModeEntry[];
      }
    | {readonly status: "load-error"; readonly error: string};
