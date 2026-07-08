import {WinAggregationPolicy} from "./WinAggregationPolicy.js";
import {WinComponent} from "./WinComponent.js";
import {WinEvaluator} from "./WinEvaluator.js";

export class HighestWinOnlyAggregationPolicy<T extends string | number | symbol = string>
implements WinAggregationPolicy<T> {
    public getPolicyName(): string {
        return "highest-win-only";
    }

    public aggregate(
        componentsByEvaluator: {evaluator: WinEvaluator<T>; components: WinComponent<T>[]}[],
    ): WinComponent<T>[] {
        let best: WinComponent<T>[] = [];
        let bestWin = -1;
        componentsByEvaluator.forEach(({components}) => {
            const total = components.reduce((sum, component) => sum + component.getWinAmount(), 0);
            if (total > bestWin) {
                best = components;
                bestWin = total;
            }
        });
        return [...best];
    }
}
