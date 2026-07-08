import {WinAggregationPolicy} from "./WinAggregationPolicy.js";
import {WinComponent} from "./WinComponent.js";
import {WinEvaluator} from "./WinEvaluator.js";

export class SumAllEnabledWinAggregationPolicy<T extends string | number | symbol = string>
implements WinAggregationPolicy<T> {
    public getPolicyName(): string {
        return "sum-all-enabled";
    }

    public aggregate(
        componentsByEvaluator: {evaluator: WinEvaluator<T>; components: WinComponent<T>[]}[],
    ): WinComponent<T>[] {
        return componentsByEvaluator.flatMap(({components}) => components);
    }
}
