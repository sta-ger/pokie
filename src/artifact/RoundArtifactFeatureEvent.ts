// A generic, mechanic-agnostic marker for something notable that happened during a round (a free-games
// trigger/retrigger, a bonus pick, a cascade refill, ...) — deliberately not a closed union, so a third-party
// game can record its own event types without a RoundArtifact schema change. See buildRoundArtifactFromSession
// for the one standard event this library derives itself ("freeGamesTriggered").
export type RoundArtifactFeatureEvent = {
    type: string;
    data?: Record<string, unknown>;
};
