import type {WeightedOutcomeLibrary} from "../weightedoutcome/WeightedOutcomeLibrary.js";

export type PreGeneratedRoundReplayOptions<T extends string | number = string> = {
    library: WeightedOutcomeLibrary<T>;
    // Precomputed, same rationale as PreGeneratedRoundBuildOptions.libraryHash — never recomputed here.
    libraryHash: string;
    seed: string;
    round: number;
};
