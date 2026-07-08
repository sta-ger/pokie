import {WinAggregationPolicy} from "./WinAggregationPolicy.js";
import {WinComponent} from "./WinComponent.js";
import {WinEvaluator} from "./WinEvaluator.js";

export class ErrorOnIncompatibleWinAggregationPolicy<T extends string | number | symbol = string>
implements WinAggregationPolicy<T> {
    public getPolicyName(): string {
        return "error-if-incompatible";
    }

    public aggregate(
        componentsByEvaluator: {evaluator: WinEvaluator<T>; components: WinComponent<T>[]}[],
    ): WinComponent<T>[] {
        return componentsByEvaluator.flatMap(({components}) => components);
    }
}
