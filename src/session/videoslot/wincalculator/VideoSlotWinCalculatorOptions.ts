import type {SharedSlotMathModel} from "../../../wasm/math/SharedSlotMath.js";
import type {SharedSlotMathPool} from "../../../wasm/math/internal/SharedSlotMathPool.js";
import type {MultiplierResolving} from "../winevaluation/MultiplierResolving.js";
import {WinAggregationPolicy} from "../winevaluation/WinAggregationPolicy.js";

export type VideoSlotWinCalculatorOptions<T extends string | number | symbol = string> = {
    /** Explicit generated-model lowering; arbitrary injected evaluators retain the ordinary pipeline. */
    sharedMathModel?: SharedSlotMathModel;
    /** Optional game-owned bounded scratch memory; calculator results remain private. */
    sharedMathPool?: SharedSlotMathPool;
    aggregationPolicy?: WinAggregationPolicy<T>;
    multiplierResolver?: MultiplierResolving<T>;
    minimumClusterSize?: number;
    validateOnEvaluate?: boolean;
};
