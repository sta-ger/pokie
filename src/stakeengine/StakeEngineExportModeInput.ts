import type {WeightedOutcomeLibrary} from "../weightedoutcome/WeightedOutcomeLibrary.js";

// One Stake Engine "mode" to export. A WeightedOutcomeLibrary is already homogeneous over one game/config/
// pokieVersion and one betMode+stake (see buildWeightedOutcomeLibrary's own "library homogeneity" note) — that's
// exactly what a Stake mode is, so one library maps to exactly one mode. A multi-mode export (e.g. "base" +
// "bonus") is simply an array of these, all sharing the same game/config/pokieVersion but differing in
// betMode/stake (see StakeEngineExportValidator's cross-mode provenance check).
//
// "cost" is Stake's own bet-cost multiplier for this mode, relative to the base bet (e.g. 1 for the base game,
// 100 for a "bonus buy" mode) — always supplied explicitly by the caller, never derived from stake ratios, since
// POKIE has no general way to know what "relative to base" should mean for a given game (see the project's
// existing convention against inferring domain decisions from incidental data).
export type StakeEngineExportModeInput<T extends string | number = string> = {
    readonly modeName: string;
    readonly cost: number;
    readonly library: WeightedOutcomeLibrary<T>;
};
