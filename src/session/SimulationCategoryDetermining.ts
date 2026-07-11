// Optional, feature-detected capability (same pattern as StakeAmountDetermining/FreeGamesStateDetermining):
// a GameSessionHandling implementation MAY implement this to explicitly declare which simulation-breakdown
// category its NEXT play() belongs to — e.g. "bonus", "respins", "holdAndWin", or anything else that doesn't
// fit the built-in base/freeGames split StakeBasedSimulationRoundCategoryDeterminer infers from
// StakeAmountDetermining.
//
// AggregateSimulationRunner asks for this (via ExplicitSimulationRoundCategoryDeterminer), when available,
// before falling back to stake-based inference — see FallbackSimulationRoundCategoryDeterminer. Returning an
// empty/invalid value for a particular round (see SimulationCategoryNameNormalizer) is a valid way to say "I
// don't have an opinion on this round" and let the fallback decide instead; it is not required to classify
// every single round explicitly.
export interface SimulationCategoryDetermining {
    getSimulationCategory(): string;
}
