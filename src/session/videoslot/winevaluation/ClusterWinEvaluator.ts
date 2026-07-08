import {ClusterWinCalculating} from "../wincalculator/ClusterWinCalculating.js";
import {ClusterWinComponent} from "./ClusterWinComponent.js";
import {WinComponent} from "./WinComponent.js";
import {WinEvaluationContext} from "./WinEvaluationContext.js";
import {WinEvaluator} from "./WinEvaluator.js";

export class ClusterWinEvaluator<T extends string | number | symbol = string> implements WinEvaluator<T> {
    private readonly calculator: ClusterWinCalculating<T>;
    private readonly minimumClusterSize: number;

    constructor(calculator: ClusterWinCalculating<T>, minimumClusterSize = 5) {
        this.calculator = calculator;
        this.minimumClusterSize = minimumClusterSize;
    }

    public getEvaluatorId(): string {
        return "cluster";
    }

    public getEvaluatorGroup(): string {
        return "cluster";
    }

    public getComponentType(): string {
        return "cluster";
    }

    public getMetadata(): Record<string, unknown> {
        return {minimumClusterSize: this.minimumClusterSize};
    }

    public evaluate(context: WinEvaluationContext<T>): WinComponent<T>[] {
        return Object.entries(this.calculator.calculateWinningClusters(context.getBet(), context.getSymbolsCombination())).map(
            ([clusterId, cluster]) => new ClusterWinComponent<T>(clusterId, cluster),
        );
    }
}
