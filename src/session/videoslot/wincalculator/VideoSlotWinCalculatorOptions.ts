import {MultiplierResolver} from "../winevaluation/MultiplierResolver.js";
import {WinAggregationPolicy} from "../winevaluation/WinAggregationPolicy.js";

export type VideoSlotWinCalculatorOptions<T extends string | number | symbol = string> = {
    aggregationPolicy?: WinAggregationPolicy<T>;
    multiplierResolver?: MultiplierResolver<T>;
    minimumClusterSize?: number;
    validateOnEvaluate?: boolean;
};
