import type {WeightedOutcomeLibrary} from "../WeightedOutcomeLibrary.js";

// One mode to persist into an outcome-library bundle. Unlike StakeEngineExportModeInput, there's no "cost" —
// that's Stake's own bet-cost multiplier, meaningless to this generic, Stake-independent persistence format.
export type OutcomeLibraryBundleModeInput<T extends string | number = string> = {
    readonly modeName: string;
    readonly library: WeightedOutcomeLibrary<T>;
};
