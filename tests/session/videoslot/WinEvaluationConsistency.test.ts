import {
    HighestWinOnlyAggregationPolicy,
    LineWinCalculating,
    ScatterWinCalculating,
    ClusterWinCalculating,
    ValueWinCalculating,
    WaysWinCalculating,
    SumAllEnabledWinAggregationPolicy,
    SymbolsCombination,
    VideoSlotConfig,
    VideoSlotWinCalculator,
    WinningCluster,
    WinningLine,
    WinningLineDescribing,
    WinningScatter,
    WinningScatterDescribing,
    WinningValue,
    WinningWay,
} from "pokie";

// Fixed win amounts per evaluator group so both the sum and the "which one is highest" outcome are
// unambiguous: line=10, scatter=5, cluster=7, value=11, ways=13 (all distinct, ways is the max).
function buildAllFiveEvaluatorsCalculator(config: VideoSlotConfig, aggregationPolicy: SumAllEnabledWinAggregationPolicy | HighestWinOnlyAggregationPolicy) {
    const lineWinCalculator: LineWinCalculating = {
        calculateWinningLines: (): Record<string, WinningLineDescribing> => ({
            0: new WinningLine(10, [0, 0], [1, 1], "0", [0, 1], [], "A"),
        }),
    };
    const scatterWinCalculator: ScatterWinCalculating = {
        calculateWinningScatters: (): Record<string, WinningScatterDescribing> => ({
            S: new WinningScatter("S", [[0, 0]], 5),
        }),
    };
    const clusterWinCalculator: ClusterWinCalculating = {
        calculateWinningClusters: () => ({0: new WinningCluster("A", [[0, 0]], 7)}),
    };
    const valueWinCalculator: ValueWinCalculating = {
        calculateWinningValues: () => ({V: new WinningValue("V", [[1, 0]], 11)}),
    };
    const waysWinCalculator: WaysWinCalculating = {
        calculateWinningWays: () => ({W: new WinningWay("W", [[2, 0]], 3, 13)}),
    };

    return new VideoSlotWinCalculator(
        config,
        lineWinCalculator,
        scatterWinCalculator,
        clusterWinCalculator,
        valueWinCalculator,
        waysWinCalculator,
        {aggregationPolicy},
    );
}

describe("Win evaluation consistency across all five win types", () => {
    test("sum-all aggregation keeps every win type: none are lost, and total equals their sum", () => {
        const config = new VideoSlotConfig();
        const calculator = buildAllFiveEvaluatorsCalculator(config, new SumAllEnabledWinAggregationPolicy());

        calculator.calculateWin(config.getAvailableBets()[0], new SymbolsCombination().fromMatrix([["A"], ["A"], ["A"]]));

        const result = calculator.getWinEvaluationResult();
        expect(result.getLineWins()).toHaveLength(1);
        expect(result.getScatterWins()).toHaveLength(1);
        expect(result.getClusterWins()).toHaveLength(1);
        expect(result.getValueWins()).toHaveLength(1);
        expect(result.getWaysWins()).toHaveLength(1);

        expect(result.getTotalWin()).toBe(10 + 5 + 7 + 11 + 13);
        expect(calculator.getWinAmount()).toBe(result.getTotalWin());
    });

    test("highest-win-only aggregation keeps only the best-performing evaluator group, and the total matches it exactly", () => {
        const config = new VideoSlotConfig();
        const calculator = buildAllFiveEvaluatorsCalculator(config, new HighestWinOnlyAggregationPolicy());

        calculator.calculateWin(config.getAvailableBets()[0], new SymbolsCombination().fromMatrix([["A"], ["A"], ["A"]]));

        const result = calculator.getWinEvaluationResult();
        // ways (13) is the single highest group among line=10, scatter=5, cluster=7, value=11, ways=13
        expect(result.getWaysWins()).toHaveLength(1);
        expect(result.getLineWins()).toHaveLength(0);
        expect(result.getClusterWins()).toHaveLength(0);
        expect(result.getValueWins()).toHaveLength(0);
        expect(result.getScatterWins()).toHaveLength(0);

        expect(result.getTotalWin()).toBe(13);
        expect(calculator.getWinAmount()).toBe(13);
    });
});
