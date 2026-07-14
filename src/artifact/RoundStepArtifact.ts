import type {RoundArtifactFeatureEvent} from "./RoundArtifactFeatureEvent.js";
import type {RoundArtifactWin} from "./RoundArtifactWin.js";

// One logical step of a round. A plain single-step round (an ordinary spin) has exactly one; a multi-step
// mechanic (cascades, multi-pick bonuses, ...) has one per stage — mirrors the same "one round is a sequence
// of stages" shape as MultiStageRoundNetworkData, but as a canonical/hashable record rather than a client
// transport payload.
export type RoundStepArtifact<T extends string | number | symbol = string> = {
    index: number;
    screen: T[][];
    totalWin: number;
    wins: RoundArtifactWin<T>[];
    featureEvents?: RoundArtifactFeatureEvent[];
    debug?: Record<string, unknown>;
};
