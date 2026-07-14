import type {JsonObject} from "../json/JsonValue.js";

// A generic, mechanic-agnostic marker for something notable that happened during a round (a free-games
// trigger/retrigger, a bonus pick, a cascade refill, ...) — deliberately not a closed union, so a third-party
// game can record its own event types without a RoundArtifact schema change. See buildRoundArtifactFromSession
// for the one standard event this library derives itself ("freeGamesTriggered"). This is the *output* shape,
// embedded in a built RoundStepArtifact/RoundArtifact: "data" is always canonicalized via canonicalizeJsonField
// at build time (deep-copied and validated as JSON-safe) — see RoundArtifactFeatureEventInput for what a
// caller actually supplies going in.
export type RoundArtifactFeatureEvent = {
    readonly type: string;
    readonly data?: JsonObject;
};

// What a caller passes in to describe a feature event before it's built — deliberately looser than
// RoundArtifactFeatureEvent's own output shape (a plain, permissive Record<string, unknown> for "data" rather
// than JsonObject) so a caller never has to pre-canonicalize their own data; buildRoundArtifact/
// buildRoundStepArtifact validate and deep-copy it for them, failing fast (RoundArtifactBuildError) if it isn't
// actually JSON-safe.
export type RoundArtifactFeatureEventInput = {
    readonly type: string;
    readonly data?: Record<string, unknown>;
};
