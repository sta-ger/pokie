import {WinComponent} from "./WinComponent.js";
import {WinEvaluationContext} from "./WinEvaluationContext.js";
import {WinEvaluator} from "./WinEvaluator.js";

export interface WinAggregationPolicy<T extends string | number | symbol = string> {
    getPolicyName(): string;

    aggregate(
        componentsByEvaluator: {evaluator: WinEvaluator<T>; components: WinComponent<T>[]}[],
        context: WinEvaluationContext<T>,
    ): WinComponent<T>[];
}
