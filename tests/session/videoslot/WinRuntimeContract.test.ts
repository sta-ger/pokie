import {
    AggregateSimulationRunner,
    CascadeGridTransformer,
    CascadingSpinResolver,
    ClusterWinCalculator,
    ErrorOnIncompatibleWinAggregationPolicy,
    GameSessionConfig,
    LeftToRightLinesPatterns,
    LineWinCalculator,
    MultiplierResolver,
    ScatterWinCalculator,
    ScatterWinCalculating,
    SeededRandomNumberGenerator,
    SelectedEvaluatorGroupWinAggregationPolicy,
    SimulationAccumulator,
    SymbolsCombination,
    SumAllEnabledWinAggregationPolicy,
    SymbolsCombinationsGenerator,
    ValueWinCalculator,
    VideoSlotConfig,
    VideoSlotSession,
    VideoSlotWinCalculator,
    WaysWinCalculator,
    WinningLine,
    WinningLineDescribing,
    WinningScatterDescribing,
} from "pokie";

describe("WinRuntimeContract", () => {
    test("WinEvaluationResult totalWin equals the sum of components", () => {
        const config = new VideoSlotConfig();
        const calculator = new VideoSlotWinCalculator(config);
        const symbols = new SymbolsCombination().fromMatrix([
            ["A", "A", "A"],
            ["A", "K", "Q"],
            ["A", "K", "Q"],
            ["K", "Q", "J"],
            ["Q", "J", "10"],
        ]);

        calculator.calculateWin(config.getAvailableBets()[0], symbols);

        const result = calculator.getWinEvaluationResult();
        const sum = result.getWinComponents().reduce((total, component) => total + component.getWinAmount(), 0);
        expect(result.getTotalWin()).toBe(sum);
    });

    test("session exposes unified win breakdown while keeping compatibility APIs", () => {
        const config = new VideoSlotConfig();
        const winCalculator = new VideoSlotWinCalculator(config);
        const generator = {
            generateSymbolsCombination: (): SymbolsCombination<string> =>
                new SymbolsCombination<string>().fromMatrix([
                    ["A", "A", "A"],
                    ["A", "K", "Q"],
                    ["A", "K", "Q"],
                    ["K", "Q", "J"],
                    ["Q", "J", "10"],
                ]),
        };
        const session = new VideoSlotSession(config, generator, winCalculator);

        session.play();

        expect(session.getWinAmount()).toBe(session.getWinEvaluationResult().getTotalWin());
        expect(Object.keys(session.getWinningLines()).length).toBe(session.getWinEvaluationResult().getLineWins().length);
        expect(Object.keys(session.getWinningScatters()).length).toBe(session.getWinEvaluationResult().getScatterWins().length);
    });

    test("explicit aggregation policy is required for mixed lines and ways", () => {
        const config = new VideoSlotConfig();
        config.setReelsNumber(3);
        config.setLinesPatterns(new LeftToRightLinesPatterns(3));
        const symbols = new SymbolsCombination().fromMatrix([
            ["A", "A", "K"],
            ["A", "A", "Q"],
            ["A", "K", "Q"],
        ]);

        const incompatibleCalculator = new VideoSlotWinCalculator(
            config,
            new LineWinCalculator(config),
            new ScatterWinCalculator(config),
            undefined,
            undefined,
            new WaysWinCalculator(config),
        );

        const validation = incompatibleCalculator.validateWinEvaluation(config.getAvailableBets()[0], symbols);
        expect(validation.hasErrors()).toBe(true);

        const explicitCalculator = new VideoSlotWinCalculator(
            config,
            new LineWinCalculator(config),
            new ScatterWinCalculator(config),
            undefined,
            undefined,
            new WaysWinCalculator(config),
            {aggregationPolicy: new SelectedEvaluatorGroupWinAggregationPolicy("ways")},
        );

        explicitCalculator.calculateWin(config.getAvailableBets()[0], symbols);
        expect(explicitCalculator.getWinEvaluationResult().getMetadata().aggregationPolicy).toBe("selected-group:ways");
    });

    test("sum-all aggregation supports mixed lines and values explicitly", () => {
        const config = new VideoSlotConfig();
        config.setReelsNumber(3);
        const calculator = new VideoSlotWinCalculator(
            config,
            new LineWinCalculator(config),
            new ScatterWinCalculator(config),
            undefined,
            new ValueWinCalculator({A: 2}),
            undefined,
            {aggregationPolicy: new SumAllEnabledWinAggregationPolicy()},
        );
        const symbols = new SymbolsCombination().fromMatrix([
            ["A", "A", "A"],
            ["A", "K", "Q"],
            ["A", "K", "Q"],
        ]);

        calculator.calculateWin(config.getAvailableBets()[0], symbols);

        expect(calculator.getWinEvaluationResult().getLineWins().length).toBeGreaterThan(0);
        expect(calculator.getWinEvaluationResult().getValueWins().length).toBeGreaterThan(0);
    });

    test("cascade runtime resolves win-remove-collapse-refill deterministically", () => {
        const config = new VideoSlotConfig();
        config.setReelsNumber(3);
        config.setReelsSymbolsNumber(3);
        const pipeline = new VideoSlotWinCalculator(config).getWinEvaluationPipeline();
        const resolver = new CascadingSpinResolver(
            pipeline,
            config,
            {
                getRefillSymbols: (): string[][] => [["K"], ["Q"], ["J"]],
            },
            new CascadeGridTransformer(),
        );

        const result = resolver.resolve(
            [
                ["A", "A", "A"],
                ["A", "K", "Q"],
                ["A", "K", "Q"],
            ],
            config.getAvailableBets()[0],
        );

        expect(result.getCascadeSteps()).toHaveLength(1);
        expect(result.getCascadeSteps()[0].getRemovedPositions().length).toBeGreaterThan(0);
        expect(result.getCascadeSteps()[0].getRngInfo()).toEqual({});
        expect(result.getCascadeSteps()[0].getDebugInfo().multiplierBreakdown).toEqual([]);
        expect(result.getFinalScreen()).toEqual([
            ["K", "A", "A"],
            ["Q", "K", "Q"],
            ["J", "K", "Q"],
        ]);
    });

    test("cascade runtime surfaces refill RNG/debug metadata when provided", () => {
        const config = new VideoSlotConfig();
        config.setReelsNumber(3);
        config.setReelsSymbolsNumber(3);
        const pipeline = new VideoSlotWinCalculator(config).getWinEvaluationPipeline();
        const resolver = new CascadingSpinResolver(pipeline, config, {
            getRefillSymbols: () => ({
                refillSymbols: [["K"], ["Q"], ["J"]],
                rngInfo: {seed: 123},
                debugInfo: {refillSource: "test"},
            }),
        });

        const result = resolver.resolve(
            [
                ["A", "A", "A"],
                ["A", "K", "Q"],
                ["A", "K", "Q"],
            ],
            config.getAvailableBets()[0],
        );

        expect(result.getCascadeSteps()[0].getRngInfo()).toEqual({seed: 123});
        expect(result.getCascadeSteps()[0].getDebugInfo().refillSource).toBe("test");
        expect(result.getDebugInfo().cascadeStepCount).toBe(1);
    });

    test("cluster grid validation catches impossible minimum cluster size", () => {
        const config = new VideoSlotConfig();
        config.setReelsNumber(2);
        config.setReelsSymbolsNumber(2);
        const clusterCalculator = new ClusterWinCalculator(config, 5);
        const winCalculator = new VideoSlotWinCalculator(
            config,
            new LineWinCalculator(config),
            new ScatterWinCalculator(config),
            clusterCalculator,
            undefined,
            undefined,
            {aggregationPolicy: new SelectedEvaluatorGroupWinAggregationPolicy("cluster"), minimumClusterSize: 5},
        );

        const validation = winCalculator.validateWinEvaluation(
            config.getAvailableBets()[0],
            new SymbolsCombination().fromMatrix([
                ["A", "A"],
                ["A", "A"],
            ]),
        );

        expect(validation.getIssues().some((issue) => issue.code === "cluster-grid-too-small")).toBe(true);
    });

    test("aggregate simulation accumulator is mergeable and does not require storing per-round payouts", () => {
        const left = new SimulationAccumulator();
        left.addRound(1, 0);
        left.addRound(1, 4);
        const right = new SimulationAccumulator();
        right.addRound(1, 8);
        right.addRound(1, 0);

        left.merge(right);
        const stats = left.getStatistics();

        expect(stats.rounds).toBe(4);
        expect(stats.totalBet).toBe(4);
        expect(stats.totalPayout).toBe(12);
        expect(stats.hitCount).toBe(2);
        expect(stats.rtp).toBe(3);
        expect(stats.confidenceInterval95.low).toBeLessThanOrEqual(stats.averagePayout);
        expect(stats.confidenceInterval95.high).toBeGreaterThanOrEqual(stats.averagePayout);
    });

    test("aggregate simulation runner returns aggregate statistics", () => {
        const config = new VideoSlotConfig(new GameSessionConfig());
        const generator = new SymbolsCombinationsGenerator(config, new SeededRandomNumberGenerator(123));
        const winCalculator = new VideoSlotWinCalculator(config);
        const session = new VideoSlotSession(config, generator, winCalculator);
        const runner = new AggregateSimulationRunner(session, 10);

        const accumulator = runner.run();
        const stats = accumulator.getStatistics();

        expect(stats.rounds).toBe(10);
        expect(stats.totalBet).toBeGreaterThan(0);
        expect(stats.totalPayout).toBeGreaterThanOrEqual(0);
    });

    test("seeded RNG remains reproducible under the new runtime contract", () => {
        const config = new VideoSlotConfig();
        const firstGenerator = new SymbolsCombinationsGenerator(config, new SeededRandomNumberGenerator(777));
        const secondGenerator = new SymbolsCombinationsGenerator(config, new SeededRandomNumberGenerator(777));

        expect(firstGenerator.generateSymbolsCombination().toMatrix()).toEqual(secondGenerator.generateSymbolsCombination().toMatrix());
    });

    test("multiplier breakdown is attached to unified evaluation result", () => {
        const config = new VideoSlotConfig();
        const fixedLine = new WinningLine(10, [0, 0], [1, 1], "0", [0, 1], [], "A");
        const lineWinCalculator = {
            calculateWinningLines: (): Record<string, WinningLineDescribing> => ({0: fixedLine}),
        };
        const noScatters: ScatterWinCalculating = {
            calculateWinningScatters: (): Record<string, WinningScatterDescribing> => ({}),
        };
        const calculator = new VideoSlotWinCalculator(
            config,
            lineWinCalculator,
            noScatters,
            undefined,
            undefined,
            undefined,
            {
                aggregationPolicy: new ErrorOnIncompatibleWinAggregationPolicy(),
                multiplierResolver: new MultiplierResolver({X2: 2}),
            },
        );

        calculator.calculateWin(
            config.getAvailableBets()[0],
            new SymbolsCombination().fromMatrix([
                ["X2", "A"],
                ["A", "A"],
            ]),
        );

        expect(calculator.getWinEvaluationResult().getMultiplierBreakdown()[0].combinedMultiplier).toBe(2);
    });

    test("validation warns when multiplier resolver supports no enabled evaluator types", () => {
        const config = new VideoSlotConfig();
        const calculator = new VideoSlotWinCalculator(
            config,
            new LineWinCalculator(config),
            new ScatterWinCalculator(config),
            undefined,
            undefined,
            undefined,
            {
                multiplierResolver: new MultiplierResolver({X2: 2}, "symbol-multipliers", (a, b) => a * b, 1, ["bonus"]),
            },
        );

        const validation = calculator.validateWinEvaluation(
            config.getAvailableBets()[0],
            new SymbolsCombination().fromMatrix([
                ["A", "A", "A"],
                ["A", "K", "Q"],
                ["A", "K", "Q"],
                ["K", "Q", "J"],
                ["Q", "J", "10"],
            ]),
        );

        expect(validation.getIssues().some((issue) => issue.code === "multiplier-resolver-has-no-supported-evaluators")).toBe(
            true,
        );
    });
});
