import {WinAggregationPolicy} from "./WinAggregationPolicy.js";
import {WinComponent} from "./WinComponent.js";
import {WinEvaluator} from "./WinEvaluator.js";

export class SelectedEvaluatorGroupWinAggregationPolicy<T extends string | number | symbol = string>
implements WinAggregationPolicy<T> {
    private readonly selectedGroup: string;

    constructor(selectedGroup: string) {
        this.selectedGroup = selectedGroup;
    }

    public getPolicyName(): string {
        return `selected-group:${this.selectedGroup}`;
    }

    public aggregate(
        componentsByEvaluator: {evaluator: WinEvaluator<T>; components: WinComponent<T>[]}[],
    ): WinComponent<T>[] {
        return componentsByEvaluator
            .filter(({evaluator}) => evaluator.getEvaluatorGroup() === this.selectedGroup)
            .flatMap(({components}) => components);
    }
}
