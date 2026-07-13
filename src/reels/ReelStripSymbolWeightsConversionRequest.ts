import type {ReelStripSymbolWeightsRemainderTieBreakPolicy} from "./ReelStripSymbolWeightsRemainderTieBreakPolicy.js";
import type {ReelStripSymbolWeightsRoundingPolicy} from "./ReelStripSymbolWeightsRoundingPolicy.js";

export type ReelStripSymbolWeightsConversionRequest = {
    length: number;
    symbolWeights: Record<string, number>;
    roundingPolicy?: ReelStripSymbolWeightsRoundingPolicy;
    remainderTieBreakPolicy?: ReelStripSymbolWeightsRemainderTieBreakPolicy;
};
