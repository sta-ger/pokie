import type {WeightedOutcomeLibrary} from "../weightedoutcome/WeightedOutcomeLibrary.js";

export type PreGeneratedRoundReplayOptions<T extends string | number = string> = {
    library: WeightedOutcomeLibrary<T>;
    // Precomputed, same rationale as PreGeneratedRoundBuildOptions.libraryHash — never recomputed here.
    libraryHash: string;
    // A library id alone is not sufficient provenance: one bundle can contain several modes.
    modeName: string;
    seed: string;
    round: number;
};
