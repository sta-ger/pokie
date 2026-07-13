import type {ReelStripGenerationConfig} from "./ReelStripGenerationConfig.js";

// One reel's strip source, in GameBlueprint.reelStripGeneration's per-reel array (index i describes
// reel i) — each reel independently chooses exactly one of these two, so literal and generated reels
// freely mix within the same blueprint. "literal" simply embeds the same string[] a plain
// GameBlueprint.reelStrips entry would hold; "generated" is that reel's own, fully independent
// ReelStripGenerationConfig (own length, own symbolCounts/symbolWeights, own seed, own constraints).
export type ReelStripGenerationSpec = {type: "literal"; strip: string[]} | ({type: "generated"} & ReelStripGenerationConfig);
