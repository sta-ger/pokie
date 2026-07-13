import type {ReelStripConstraint} from "./ReelStripConstraint.js";
import type {ReelStripScorer} from "./ReelStripScorer.js";
import type {ReelStripSymbolWeightsRemainderTieBreakPolicy} from "./ReelStripSymbolWeightsRemainderTieBreakPolicy.js";
import type {ReelStripSymbolWeightsRoundingPolicy} from "./ReelStripSymbolWeightsRoundingPolicy.js";

// Same shape as ReelStripGenerationRequest, except symbolWeights (converted to exact symbolCounts
// via ReelStripSymbolWeightsConverter before generation) stands in for symbolCounts.
export type ReelStripWeightedGenerationRequest = {
    length: number;
    symbolWeights: Record<string, number>;
    roundingPolicy?: ReelStripSymbolWeightsRoundingPolicy;
    remainderTieBreakPolicy?: ReelStripSymbolWeightsRemainderTieBreakPolicy;
    seed?: number;
    lockedPositions?: Record<number, string>;
    constraints?: ReelStripConstraint[];
    maxAttempts?: number;
    scorer?: ReelStripScorer;
};
