import type {JsonObject} from "../json/JsonValue.js";

// A generic, mechanic-agnostic marker for something notable that happened during a round (a free-games
// trigger/retrigger, a bonus pick, a cascade refill, ...) — deliberately not a closed union, so a third-party
// game can record its own event types without a RoundRecord schema change. See buildRoundRecordFromSession
// for the one standard event this library derives itself ("freeGamesTriggered"). This is the *output* shape,
// embedded in a built RoundStepRecord/RoundRecord: "data" is always canonicalized via canonicalizeJsonField
// at build time (deep-copied and validated as JSON-safe) — see RoundRecordFeatureEventInput for what a
// caller actually supplies going in.
export type RoundRecordFeatureEvent = {
    readonly type: string;
    readonly data?: JsonObject;
};

// What a caller passes in to describe a feature event before it's built — deliberately looser than
// RoundRecordFeatureEvent's own output shape (a plain, permissive Record<string, unknown> for "data" rather
// than JsonObject) so a caller never has to pre-canonicalize their own data; buildRoundRecord/
// buildRoundStepRecord validate and deep-copy it for them, failing fast (RoundRecordBuildError) if it isn't
// actually JSON-safe.
export type RoundRecordFeatureEventInput = {
    readonly type: string;
    readonly data?: Record<string, unknown>;
};
