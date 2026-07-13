import type {ReelStripGenerationBlueprint} from "./ReelStripGenerationBlueprint.js";
import type {ReelStripGenerationSummary} from "./ReelStripGenerationSummary.js";

// Recorded on GameBuildInfo.reelStripGeneration whenever a blueprint used reelStripGeneration:
// "config" is the original authored configuration (the exact GameBlueprint.reelStripGeneration
// block -- seed, symbolCounts/symbolWeights, constraints, ...), and "reels" is what actually happened
// when it ran, one entry per reel. Absent entirely when the blueprint used literal reelStrips (or
// neither reelStrips nor reelStripGeneration).
export type GameBuildInfoReelStripGeneration = {
    config: ReelStripGenerationBlueprint;
    reels: ReelStripGenerationSummary[];
};
