import type {ReelStripGenerationSummary} from "./ReelStripGenerationSummary.js";

// Recorded on GameBuildInfo.reelStripGeneration whenever a blueprint's reelStripGeneration actually
// generated at least one reel: one ReelStripGenerationSummary per *generated* reel (its own config,
// seed, and — on success — resulting exact strip). Literal reels have no generation story to record
// (their content is already visible in the materialized reelStrips output). Absent entirely when the
// blueprint used literal reelStrips only, an all-literal reelStripGeneration, or neither field.
export type GameBuildInfoReelStripGeneration = {
    reels: ReelStripGenerationSummary[];
};
