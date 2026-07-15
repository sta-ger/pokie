import type {JsonObject} from "../json/JsonValue.js";

// One entry of a Stake Engine book's "events" array (see StakeEngineRoundEventsProjector). Stake's own math-sdk
// doesn't standardize an event schema beyond "a list of dictionary objects" — each game defines its own
// mechanic-specific vocabulary — so this is deliberately just an open JSON object with a stable "type" and its
// position ("index") within the round, mirroring RoundArtifactFeatureEvent's own "generic marker" shape rather
// than inventing mechanic-specific fields POKIE has no concept of.
export type StakeEngineEvent = JsonObject & {
    readonly index: number;
    readonly type: string;
};
