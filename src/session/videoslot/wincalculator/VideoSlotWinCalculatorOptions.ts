import type {SharedSlotMathModel} from "../../../wasm/math/SharedSlotMath.js";
import {MultiplierResolver} from "../winevaluation/MultiplierResolver.js";
import {WinAggregationPolicy} from "../winevaluation/WinAggregationPolicy.js";

export type VideoSlotWinCalculatorOptions<T extends string | number | symbol = string> = {
    /** Explicit generated-model lowering; arbitrary injected evaluators retain the ordinary pipeline. */
    sharedMathModel?: SharedSlotMathModel;
    aggregationPolicy?: WinAggregationPolicy<T>;
    multiplierResolver?: MultiplierResolver<T>;
    minimumClusterSize?: number;
    validateOnEvaluate?: boolean;
};
