import type {JsonObject} from "../json/JsonValue.js";
import type {RoundArtifactFeatureEvent} from "./RoundArtifactFeatureEvent.js";
import type {RoundArtifactWin} from "./RoundArtifactWin.js";

// One logical step of a round. A plain single-step round (an ordinary spin) has exactly one; a multi-step
// mechanic (cascades, multi-pick bonuses, ...) has one per stage — mirrors the same "one round is a sequence
// of stages" shape as MultiStageRoundNetworkData, but as a canonical/hashable record rather than a client
// transport payload. Deeply readonly, and always deeply copied/frozen at build time (see
// buildRoundStepArtifact) — a caller can never observe a step artifact change after the fact, whether by
// mutating their own original input or by holding a reference to the artifact itself.
export type RoundStepArtifact<T extends string | number | symbol = string> = {
    readonly index: number;
    readonly screen: readonly (readonly T[])[];
    readonly totalWin: number;
    readonly wins: readonly RoundArtifactWin<T>[];
    readonly featureEvents?: readonly RoundArtifactFeatureEvent[];
    readonly debug?: JsonObject;
};
