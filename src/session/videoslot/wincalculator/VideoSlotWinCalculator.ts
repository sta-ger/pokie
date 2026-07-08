import {
    ClusterWinCalculating,
    LineWinCalculating,
    LineWinCalculator,
    ScatterWinCalculating,
    ScatterWinCalculator,
    SymbolsCombinationDescribing,
    ValidationResult,
    ValueWinCalculating,
    VideoSlotConfigDescribing,
    VideoSlotWinCalculating,
    WaysWinCalculating,
    WinningClusterDescribing,
    WinningCluster,
    WinningLineDescribing,
    WinningLine,
    WinningScatter,
    WinningScatterDescribing,
    WinningValue,
    WinningValueDescribing,
    WinningWay,
    WinningWayDescribing,
} from "pokie";
import {ClusterWinComponent} from "../winevaluation/ClusterWinComponent.js";
import {ClusterWinEvaluator} from "../winevaluation/ClusterWinEvaluator.js";
import {ErrorOnIncompatibleWinAggregationPolicy} from "../winevaluation/ErrorOnIncompatibleWinAggregationPolicy.js";
import {LineWinComponent} from "../winevaluation/LineWinComponent.js";
import {LineWinEvaluator} from "../winevaluation/LineWinEvaluator.js";
import {ScatterWinComponent} from "../winevaluation/ScatterWinComponent.js";
import {ScatterWinEvaluator} from "../winevaluation/ScatterWinEvaluator.js";
import {ValueWinComponent} from "../winevaluation/ValueWinComponent.js";
import {ValueWinEvaluator} from "../winevaluation/ValueWinEvaluator.js";
import {WaysWinComponent} from "../winevaluation/WaysWinComponent.js";
import {WaysWinEvaluator} from "../winevaluation/WaysWinEvaluator.js";
import {WinEvaluationContext} from "../winevaluation/WinEvaluationContext.js";
import {WinEvaluationPipeline} from "../winevaluation/WinEvaluationPipeline.js";
import {WinEvaluationResult} from "../winevaluation/WinEvaluationResult.js";
import {WinEvaluator} from "../winevaluation/WinEvaluator.js";
import {VideoSlotWinCalculatorOptions} from "./VideoSlotWinCalculatorOptions.js";

export class VideoSlotWinCalculator<T extends string | number | symbol = string> implements VideoSlotWinCalculating<T> {
    private readonly config: VideoSlotConfigDescribing<T>;
    private readonly lineWinCalculator: LineWinCalculating<T>;
    private readonly scatterWinCalculator: ScatterWinCalculating<T>;
    private readonly clusterWinCalculator?: ClusterWinCalculating<T>;
    private readonly valueWinCalculator?: ValueWinCalculating<T>;
    private readonly waysWinCalculator?: WaysWinCalculating<T>;
    private readonly options: VideoSlotWinCalculatorOptions<T>;
    private readonly pipeline: WinEvaluationPipeline<T>;

    private winEvaluationResult: WinEvaluationResult<T> = new WinEvaluationResult<T>();

    constructor(
        conf: VideoSlotConfigDescribing<T>,
        lineWinCalculator: LineWinCalculating<T> = new LineWinCalculator<T>(conf),
        scatterWinCalculator: ScatterWinCalculating<T> = new ScatterWinCalculator<T>(conf),
        // Left undefined by default (rather than defaulting to a ClusterWinCalculator
        // instance) so calculateWin() below only computes cluster wins when a caller opts in —
        // existing callers that never pass this argument see no change in behavior or winAmount.
        clusterWinCalculator: ClusterWinCalculating<T> | undefined = undefined,
        // Same reasoning as clusterWinCalculator above — no default instance, opt-in only.
        valueWinCalculator: ValueWinCalculating<T> | undefined = undefined,
        // Same reasoning again — opt-in only.
        waysWinCalculator: WaysWinCalculating<T> | undefined = undefined,
        options: VideoSlotWinCalculatorOptions<T> = {},
    ) {
        this.config = conf;
        this.lineWinCalculator = lineWinCalculator;
        this.scatterWinCalculator = scatterWinCalculator;
        this.clusterWinCalculator = clusterWinCalculator;
        this.valueWinCalculator = valueWinCalculator;
        this.waysWinCalculator = waysWinCalculator;
        this.options = options;
        this.pipeline = new WinEvaluationPipeline<T>(
            this.createEvaluators(),
            options.aggregationPolicy ?? new ErrorOnIncompatibleWinAggregationPolicy<T>(),
            options.multiplierResolver,
            undefined,
            {validateOnEvaluate: options.validateOnEvaluate},
        );
    }

    public calculateWin(bet: number, symbolsCombination: SymbolsCombinationDescribing<T>): void {
        if (this.config.getAvailableBets().some((availableBet) => availableBet === bet)) {
            this.winEvaluationResult = this.pipeline.evaluate(new WinEvaluationContext<T>(bet, symbolsCombination, this.config));
        } else {
            throw new Error(`Bet ${bet} is not specified at paytable`);
        }
    }

    public validateWinEvaluation(bet: number, symbolsCombination: SymbolsCombinationDescribing<T>): ValidationResult {
        return this.pipeline.validate(new WinEvaluationContext<T>(bet, symbolsCombination, this.config));
    }

    public getWinEvaluationResult(): WinEvaluationResult<T> {
        return this.winEvaluationResult;
    }

    public getWinningLines(): Record<string, WinningLineDescribing<T>> {
        return this.getWinEvaluationResult()
            .getLineWins()
            .reduce(
                (acc, component) => ({
                    ...acc,
                    [component.getWinningLine().getLineId()]: this.toWinningLine(component),
                }),
                {} as Record<string, WinningLineDescribing<T>>,
            );
    }

    public getWinningScatters(): Record<T, WinningScatterDescribing<T>> {
        return this.getWinEvaluationResult()
            .getScatterWins()
            .reduce((acc, component) => {
                acc[component.getWinningScatter().getSymbolId()] = this.toWinningScatter(component);
                return acc;
            }, {} as Record<T, WinningScatterDescribing<T>>);
    }

    public getWinningClusters(): Record<string, WinningClusterDescribing<T>> {
        return this.getWinEvaluationResult()
            .getClusterWins()
            .reduce(
                (acc, component) => ({
                    ...acc,
                    [component.getId()]: this.toWinningCluster(component),
                }),
                {} as Record<string, WinningClusterDescribing<T>>,
            );
    }

    public getWinningValues(): Record<T, WinningValueDescribing<T>> {
        return this.getWinEvaluationResult()
            .getValueWins()
            .reduce((acc, component) => {
                acc[component.getWinningValue().getSymbolId()] = this.toWinningValue(component);
                return acc;
            }, {} as Record<T, WinningValueDescribing<T>>);
    }

    public getWinningWays(): Record<T, WinningWayDescribing<T>> {
        return this.getWinEvaluationResult()
            .getWaysWins()
            .reduce((acc, component) => {
                acc[component.getWinningWay().getSymbolId()] = this.toWinningWay(component);
                return acc;
            }, {} as Record<T, WinningWayDescribing<T>>);
    }

    public getWinAmount(): number {
        return this.getWinEvaluationResult().getTotalWin();
    }

    public getLinesWinning(): number {
        return this.getWinEvaluationResult().getLineWins().reduce((sum, component) => sum + component.getWinAmount(), 0);
    }

    public getScattersWinning(): number {
        // Object.values() on a Record keyed by a generic type parameter loses its value type,
        // so it's cast back to a string-keyed view (safe: JS object keys are always strings/symbols
        // at runtime regardless of T).
        return this.getWinEvaluationResult().getScatterWins().reduce((sum, component) => sum + component.getWinAmount(), 0);
    }

    public getClustersWinning(): number {
        return this.getWinEvaluationResult().getClusterWins().reduce((sum, component) => sum + component.getWinAmount(), 0);
    }

    public getValuesWinning(): number {
        return this.getWinEvaluationResult().getValueWins().reduce((sum, component) => sum + component.getWinAmount(), 0);
    }

    public getWaysWinning(): number {
        return this.getWinEvaluationResult().getWaysWins().reduce((sum, component) => sum + component.getWinAmount(), 0);
    }

    public getWinEvaluationPipeline(): WinEvaluationPipeline<T> {
        return this.pipeline;
    }

    private createEvaluators(): WinEvaluator<T>[] {
        const evaluators: WinEvaluator<T>[] = [
            new LineWinEvaluator<T>(this.lineWinCalculator),
            new ScatterWinEvaluator<T>(this.scatterWinCalculator),
        ];
        if (this.clusterWinCalculator) {
            evaluators.push(
                new ClusterWinEvaluator<T>(
                    this.clusterWinCalculator,
                    this.options.minimumClusterSize ?? 5,
                ),
            );
        }
        if (this.valueWinCalculator) {
            evaluators.push(new ValueWinEvaluator<T>(this.valueWinCalculator));
        }
        if (this.waysWinCalculator) {
            evaluators.push(new WaysWinEvaluator<T>(this.waysWinCalculator));
        }
        return evaluators;
    }

    private toWinningLine(component: LineWinComponent<T>): WinningLineDescribing<T> {
        const line = component.getWinningLine();
        return new WinningLine<T>(
            component.getWinAmount(),
            line.getDefinition(),
            line.getPattern(),
            line.getLineId(),
            line.getSymbolsPositions(),
            line.getWildSymbolsPositions(),
            line.getSymbolId(),
        );
    }

    private toWinningScatter(component: ScatterWinComponent<T>): WinningScatterDescribing<T> {
        const scatter = component.getWinningScatter();
        return new WinningScatter<T>(scatter.getSymbolId(), scatter.getSymbolsPositions(), component.getWinAmount());
    }

    private toWinningCluster(component: ClusterWinComponent<T>): WinningClusterDescribing<T> {
        const cluster = component.getWinningCluster();
        return new WinningCluster<T>(cluster.getSymbolId(), cluster.getSymbolsPositions(), component.getWinAmount());
    }

    private toWinningValue(component: ValueWinComponent<T>): WinningValueDescribing<T> {
        const value = component.getWinningValue();
        return new WinningValue<T>(value.getSymbolId(), value.getSymbolsPositions(), component.getWinAmount());
    }

    private toWinningWay(component: WaysWinComponent<T>): WinningWayDescribing<T> {
        const way = component.getWinningWay();
        return new WinningWay<T>(way.getSymbolId(), way.getSymbolsPositions(), way.getWaysCount(), component.getWinAmount());
    }
}
