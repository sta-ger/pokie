import type {WeightedOutcomeLibrary} from "../weightedoutcome/WeightedOutcomeLibrary.js";

// One bet mode's worth of content to deploy to an ExternalDeploymentTarget: a canonical WeightedOutcomeLibrary,
// already homogeneous over one game/config/pokieVersion and one betMode+stake (see
// WeightedOutcomeLibrary's own "library homogeneity" note), under the name this target's own format knows it
// by. A multi-mode deployment (e.g. "base" + "bonus") is simply an array of these — the same shape
// StakeEngineExportModeInput uses, minus Stake's own "cost" field, which is specific to Stake's unit
// conversion and has no general meaning across arbitrary external targets.
export type ExternalDeploymentModeInput<T extends string | number = string> = {
    readonly modeName: string;
    readonly library: WeightedOutcomeLibrary<T>;
};
