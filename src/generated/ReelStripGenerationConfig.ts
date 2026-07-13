import type {ReelStripSymbolWeightsRemainderTieBreakPolicy} from "../reels/ReelStripSymbolWeightsRemainderTieBreakPolicy.js";
import type {ReelStripSymbolWeightsRoundingPolicy} from "../reels/ReelStripSymbolWeightsRoundingPolicy.js";
import type {ReelStripConstraintSpec} from "./ReelStripConstraintSpec.js";

// One reel's own build-time generation configuration (see ReelStripGenerationSpec) — every reel that
// isn't a literal strip has entirely independent length/symbolCounts-or-symbolWeights/constraints,
// there is no blueprint-wide shared spec. "seed" is required (not optional, unlike
// ReelStripGenerationRequest.seed): build-time generation must be reproducible, so there's no
// "non-deterministic by default" mode here.
export type ReelStripGenerationConfig = {
    length: number;
    // Exactly one of these two must be set -- mirrors ReelStripGenerator's own generate() vs.
    // generateFromSymbolWeights() split.
    symbolCounts?: Record<string, number>;
    symbolWeights?: Record<string, number>;
    seed: number;
    roundingPolicy?: ReelStripSymbolWeightsRoundingPolicy;
    remainderTieBreakPolicy?: ReelStripSymbolWeightsRemainderTieBreakPolicy;
    lockedPositions?: Record<number, string>;
    constraints?: ReelStripConstraintSpec[];
    maxAttempts?: number;
};
