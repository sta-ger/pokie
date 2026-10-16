import {
    WinEvaluationPipeline, WinEvaluationContext, ValueWinComponent,
    AggregateSimulationRunner,
    CascadeGridTransformer,
    CascadingSpinResolver,
    ClusterWinCalculator,
    CustomLinesDefinitions,
    ErrorOnIncompatibleWinAggregationPolicy,
    GameSessionConfig,
    LeftToRightLinesPatterns,
    LineWinCalculator,
    Paytable,
    RightToLeftLinesPatterns,
    ScatteredLinesPatterns,
    resolveSharedSlotMathModel,
    SymbolsSequence,
    MaxCascadeStepsExceededError,
    MultiplierResolver,
    ScatterWinCalculator,
    SharedSlotMath,
    SharedSlotMathWinEvaluator,
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
    VideoSlotSessionSerializer,
    VideoSlotWinCalculating,
    VideoSlotWinCalculator,
    WaysWinCalculator,
    WinningCluster,
    WinningLine,
    WinningLineDescribing,
    WinningScatter,
    WinningScatterDescribing,
    WinningValue,
    WinningWay,
    type SharedSlotMathModel,
    type VideoSlotWinCalculatorOptions,
} from "@fromstan/pokie";

describe("shared calculator configuration authority", () => {
    function fixture(winModel: SharedSlotMathModel["winModel"] = {type: "lines"}, options: VideoSlotWinCalculatorOptions = {}, symbols = ["A", "B", "W", "S"]) {
        const config = new VideoSlotConfig();
        config.setAvailableBets([0.05, 7.5, 1e-7]);
        config.setReelsNumber(3);
        config.setReelsSymbolsNumber(1);
        config.setWildSymbols(["W"]);
        config.setScatterSymbols(["S"]);
        config.setAvailableSymbols(symbols);
        config.setSymbolsSequences(Array.from({length: 3}, () => new SymbolsSequence().fromArray(["A", "W", "S"].filter(symbol => symbols.includes(symbol)))));
        const paytable = new Paytable<string>(config.getAvailableBets());
        paytable.setPayoutForSymbol(symbols[0], 3, 2);
        config.setPaytable(paytable);
        const model = resolveSharedSlotMathModel({manifest: {id: "authority", name: "Authority", version: "1.0.0"},
            reels: 3, rows: 1, symbols, wilds: ["W"], scatters: ["S"], availableBets: config.getAvailableBets(),
            reelStrips: config.getSymbolsSequences().map(strip => strip.toArray()), paytable: {[symbols[0]]: {3: 2}}, winModel});
        const create = (declared = model): VideoSlotWinCalculator => new VideoSlotWinCalculator(config, undefined, undefined, undefined, undefined, undefined, {...options, sharedMathModel: declared});
        return {config, model, create};
    }

    test.each(["lines", "ways", "clusters"] as const)("%s executes current public payouts, including exact bet-specific amounts and replacement configs", type => {
        const {config, create} = fixture({type, ...(type === "clusters" ? {minimumClusterSize: 3} : {})});
        const calculator = create();
        const screen = new SymbolsCombination().fromMatrix([["A"], ["A"], ["A"]]);
        calculator.calculateWin(0.05, screen);
        expect(calculator.getWinAmount()).toBe(2 * 0.05);
        config.getPaytable().setPayoutForSymbol("A", 3, 9);
        for (const bet of config.getAvailableBets()) {
            calculator.calculateWin(bet, screen);
            expect(calculator.getWinAmount()).toBe(config.getPaytable().getWinAmountForSymbol("A", 3, bet));
        }
        // A division to recover a multiplier would round this authored absolute amount.
        const map = config.getPaytable().toMap();
        map[0.05].A[3] = 0.12345678901234566;
        config.getPaytable().fromMap(map);
        calculator.calculateWin(0.05, screen);
        expect(calculator.getWinAmount()).toBe(map[0.05].A[3]);
        const replacement = new Paytable<string>([0.05]);
        replacement.setPayoutForSymbol("A", 3, 0);
        config.setPaytable(replacement);
        calculator.calculateWin(0.05, screen);
        expect(calculator.getWinAmount()).toBe(0);
        expect(calculator.isStatelessForSessionRestoration()).toBe(true);
    });

    test.each(["paytable", "paylines", "reels", "wilds", "bets", "strips"])("rejects initially mismatched %s declarations", field => {
        const {model, create} = fixture();
        const changed = JSON.parse(JSON.stringify(model)) as SharedSlotMathModel;
        let mismatch = changed;
        if (field === "paytable") mismatch = {...changed, paytable: {A: {3: 9}}};
        if (field === "paylines") mismatch = {...changed, paylines: []};
        if (field === "reels") mismatch = {...changed, rows: 2};
        if (field === "wilds") mismatch = {...changed, wilds: []};
        if (field === "bets") mismatch = {...changed, availableBets: [1]};
        if (field === "strips") mismatch = {...changed, reelStrips: [["W"], ["W"], ["W"]]};
        expect(() => create(mismatch)).toThrow(/does not match/);
    });

    test.each(["right-to-left", "scattered", "custom-minimum", "mutated-pattern", "wild-substitution", "modifiers", "custom-pattern-strategy"])("rejects unsupported %s at construction and after mutation, including restoration", rule => {
        const {config, create} = fixture();
        const calculator = create();
        if (rule === "right-to-left") config.setLinesPatterns(new RightToLeftLinesPatterns(3));
        if (rule === "scattered") config.setLinesPatterns(new ScatteredLinesPatterns(3));
        if (rule === "custom-minimum") config.setLinesPatterns(new LeftToRightLinesPatterns(3, 3));
        if (rule === "mutated-pattern") config.getLinesPatterns().toArray()[0][0] = 0;
        if (rule === "wild-substitution") config.setWildSubstitutions({W: ["B"]});
        if (rule === "modifiers") config.setScreenModifiers({wilds: [{symbol: "W", factor: 2}], rules: []});
        if (rule === "custom-pattern-strategy") config.setLinesPatterns({toArray: () => new LeftToRightLinesPatterns(3).toArray()});
        expect(() => create()).toThrow(/cannot lower/);
        expect(() => calculator.calculateWin(0.05, new SymbolsCombination().fromMatrix([["A"], ["A"], ["A"]]))).toThrow(/cannot lower/);
        expect(calculator.isStatelessForSessionRestoration()).toBe(false);
    });

    test("relowers supported paylines and wild updates and preserves public line identifiers", () => {
        const {config, create} = fixture();
        const calculator = create();
        const lines = new CustomLinesDefinitions();
        lines.setLineDefinition("authored-line", [0, 0, 0]);
        config.setLinesDefinitions(lines);
        const screen = new SymbolsCombination().fromMatrix([["W"], ["A"], ["A"]]);
        calculator.calculateWin(0.05, screen);
        expect(Object.keys(calculator.getWinningLines())).toEqual(["authored-line"]);
        expect(calculator.getWinAmount()).toBe(0.1);
        config.setWildSymbols([]);
        calculator.calculateWin(0.05, screen);
        expect(calculator.getWinAmount()).toBe(0);
        expect(calculator.isStatelessForSessionRestoration()).toBe(true);
    });

    test.each([true, false])("retains cluster and ways preflight validation with validateOnEvaluate=%s", validateOnEvaluate => {
        for (const kind of ["clusters", "ways"] as const) {
            const {create} = fixture({type: kind, ...(kind === "clusters" ? {minimumClusterSize: 4} : {})}, {validateOnEvaluate}, kind === "ways" ? ["W", "S"] : undefined);
            const calculator = create();
            const screen = new SymbolsCombination().fromMatrix(Array.from({length: 3}, () => [kind === "ways" ? "W" : "A"]));
            const codes = calculator.validateWinEvaluation(0.05, screen).getIssues().map(issue => issue.code);
            expect(codes).toContain(kind === "clusters" ? "cluster-grid-too-small" : "ways-no-payable-symbols");
            expect(calculator.getWinEvaluationPipeline().getOptions().validateOnEvaluate).toBe(validateOnEvaluate);
            if (validateOnEvaluate) expect(() => calculator.calculateWin(0.05, screen)).toThrow(kind === "clusters" ? /requires at least 4 cells/ : /no payable/);
            else expect(() => calculator.calculateWin(0.05, screen)).not.toThrow();
        }
    });

    test("rejects contradictory minimum-size options rather than discarding them", () => {
        const {create} = fixture({type: "clusters", minimumClusterSize: 3}, {minimumClusterSize: 4});
        expect(() => create()).toThrow(/minimumClusterSize/);
    });

    test("rejects unsupported model declarations instead of ignoring extra semantics", () => {
        const {model, create} = fixture();
        expect(() => create({...model, winModel: {type: "lines", minimumClusterSize: 3}})).toThrow(/Unsupported shared/);
        expect(() => create({...model, winModel: {type: "lines", patterns: "right-to-left"} as unknown as SharedSlotMathModel["winModel"]})).toThrow(/Unsupported shared/);
    });

    test("direct shared evaluators and retained pipelines cannot consume a different config", () => {
        const {config, model, create} = fixture();
        const screen = new SymbolsCombination().fromMatrix([["A"], ["A"], ["A"]]);
        const evaluator = new SharedSlotMathWinEvaluator(new SharedSlotMath(model));
        expect(evaluator.evaluate(new WinEvaluationContext(0.05, screen, config))).toHaveLength(1);
        config.getPaytable().setPayoutForSymbol("A", 3, 9);
        expect(() => evaluator.evaluate(new WinEvaluationContext(0.05, screen, config))).toThrow(/does not match/);
        const other = fixture();
        const pipeline = other.create().getWinEvaluationPipeline();
        expect(() => pipeline.evaluate(new WinEvaluationContext(0.05, screen, config))).toThrow(/context does not match/);
        expect(() => create()).toThrow(/does not match/);
    });
});

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

    test("cascade resolver throws instead of looping forever when maxCascadeSteps is exceeded", () => {
        const config = new VideoSlotConfig();
        config.setReelsNumber(3);
        config.setReelsSymbolsNumber(3);
        const pipeline = new VideoSlotWinCalculator(config).getWinEvaluationPipeline();
        const resolver = new CascadingSpinResolver(
            pipeline,
            config,
            {
                getRefillSymbols: () => [["A", "A", "A"], ["A", "A", "A"], ["A", "A", "A"]],
            },
            new CascadeGridTransformer(),
            {maxCascadeSteps: 3},
        );

        expect(() =>
            resolver.resolve(
                [
                    ["A", "A", "A"],
                    ["A", "A", "A"],
                    ["A", "A", "A"],
                ],
                config.getAvailableBets()[0],
            ),
        ).toThrow(MaxCascadeStepsExceededError);
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
        expect(stats.averagePayoutConfidenceInterval95.low).toBeLessThanOrEqual(stats.averagePayout);
        expect(stats.averagePayoutConfidenceInterval95.high).toBeGreaterThanOrEqual(stats.averagePayout);
        expect(stats.rtpConfidenceInterval95.low).toBeLessThanOrEqual(stats.rtp);
        expect(stats.rtpConfidenceInterval95.high).toBeGreaterThanOrEqual(stats.rtp);
    });

    test("aggregate simulation statistics distinguish payout CI from RTP CI for variable bets", () => {
        const accumulator = new SimulationAccumulator();
        accumulator.addRound(1, 1);
        accumulator.addRound(2, 2);
        accumulator.addRound(4, 0);

        const stats = accumulator.getStatistics();
        expect(stats.averagePayout).toBe(1);
        // RTP is total payout divided by actual paid stake, not an unweighted
        // mean of per-round payout ratios: 3 payout / (1 + 2 + 4) stake.
        expect(stats.rtp).toBeCloseTo(3 / 7, 10);
        expect(stats.averagePayoutConfidenceInterval95.high).not.toBe(stats.rtpConfidenceInterval95.high);
    });

    test("constant bet RTP CI matches payout CI normalized by bet", () => {
        const accumulator = new SimulationAccumulator();
        accumulator.addRound(2, 0);
        accumulator.addRound(2, 4);
        accumulator.addRound(2, 2);

        const stats = accumulator.getStatistics();
        expect(stats.rtp).toBe(stats.averagePayout / 2);
        expect(stats.rtpConfidenceInterval95.low).toBeCloseTo(stats.averagePayoutConfidenceInterval95.low / 2, 10);
        expect(stats.rtpConfidenceInterval95.high).toBeCloseTo(stats.averagePayoutConfidenceInterval95.high / 2, 10);
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
                multiplierResolver: new MultiplierResolver({X2: 2}, {supportedComponentTypes: ["bonus"]}),
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

    test("multiplier resolver applies only to supported component types", () => {
        const config = new VideoSlotConfig();
        const lineWinCalculator = {
            calculateWinningLines: (): Record<string, WinningLineDescribing> => ({
                0: new WinningLine(10, [0, 0], [1, 1], "0", [0, 1], [], "A"),
            }),
        };
        const scatterWinCalculator: ScatterWinCalculating = {
            calculateWinningScatters: (): Record<string, WinningScatterDescribing> => ({
                S: new WinningScatter("S", [[0, 0]], 5),
            }),
        };
        const calculator = new VideoSlotWinCalculator(
            config,
            lineWinCalculator,
            scatterWinCalculator,
            undefined,
            undefined,
            undefined,
            {
                multiplierResolver: new MultiplierResolver({X2: 2}, {supportedComponentTypes: ["line"]}),
            },
        );

        calculator.calculateWin(
            config.getAvailableBets()[0],
            new SymbolsCombination().fromMatrix([
                ["X2", "A"],
                ["A", "A"],
            ]),
        );

        expect(calculator.getWinningLines()[0].getWinAmount()).toBe(20);
        expect(calculator.getWinningScatters().S.getWinAmount()).toBe(5);
    });

    test("undefined supportedComponentTypes means multiplier resolver applies to all component types", () => {
        const config = new VideoSlotConfig();
        const lineWinCalculator = {
            calculateWinningLines: (): Record<string, WinningLineDescribing> => ({
                0: new WinningLine(10, [0, 0], [1, 1], "0", [0, 1], [], "A"),
            }),
        };
        const scatterWinCalculator: ScatterWinCalculating = {
            calculateWinningScatters: (): Record<string, WinningScatterDescribing> => ({
                S: new WinningScatter("S", [[0, 0]], 5),
            }),
        };
        const calculator = new VideoSlotWinCalculator(config, lineWinCalculator, scatterWinCalculator, undefined, undefined, undefined, {
            multiplierResolver: new MultiplierResolver({X2: 2}),
        });

        calculator.calculateWin(
            config.getAvailableBets()[0],
            new SymbolsCombination().fromMatrix([
                ["X2", "A"],
                ["A", "A"],
            ]),
        );

        expect(calculator.getWinningLines()[0].getWinAmount()).toBe(20);
        expect(calculator.getWinningScatters().S.getWinAmount()).toBe(10);
    });

    test("legacy custom calculator without getWinEvaluationResult still pays and serializes correctly", () => {
        class LegacyCalculator implements VideoSlotWinCalculating {
            private wasCalculated = false;

            public calculateWin(): void {
                this.wasCalculated = true;
            }

            public getWinAmount(): number {
                return 123;
            }

            public getWinningLines(): Record<string, WinningLineDescribing> {
                return {0: new WinningLine(123, [0], [1], "0", [0], [], "A")};
            }

            public getWinningScatters(): Record<string, WinningScatterDescribing> {
                return {};
            }

            public getLinesWinning(): number {
                return 123;
            }

            public getScattersWinning(): number {
                return 0;
            }
        }

        const config = new VideoSlotConfig();
        const generator = {
            generateSymbolsCombination: (): SymbolsCombination<string> => new SymbolsCombination<string>().fromMatrix([["A"]]),
        };
        const session = new VideoSlotSession(config, generator, new LegacyCalculator());
        const initialCredits = session.getCreditsAmount();

        session.play();

        expect(session.getWinAmount()).toBe(123);
        expect(session.getCreditsAmount()).toBe(initialCredits - session.getBet() + 123);
        expect(session.getWinEvaluationResult().getTotalWin()).toBe(123);
        expect(session.getWinEvaluationResult().getLineWins()).toHaveLength(1);
        expect(session.getWinEvaluationResult().getWinningPositions()).toEqual([[0, 0]]);

        const payload = new VideoSlotSessionSerializer().getRoundData(session);
        expect(payload.totalWin).toBe(123);
        expect(payload.winEvaluationResult?.totalWin).toBe(123);
        expect(payload.winningPositions).toEqual([[0, 0]]);
    });

    test("serializer derives legacy cluster/value/ways fields from canonical win evaluation result", () => {
        const config = new VideoSlotConfig();
        const noLines = {calculateWinningLines: (): Record<string, WinningLineDescribing> => ({})};
        const noScatters: ScatterWinCalculating = {calculateWinningScatters: (): Record<string, WinningScatterDescribing> => ({})};
        const calculator = new VideoSlotWinCalculator(
            config,
            noLines,
            noScatters,
            {calculateWinningClusters: () => ({0: new WinningCluster("A", [[0, 0]], 7)})},
            {calculateWinningValues: () => ({V: new WinningValue("V", [[1, 0]], 11)})},
            {calculateWinningWays: () => ({W: new WinningWay("W", [[2, 0]], 2, 13)})},
            {aggregationPolicy: new SumAllEnabledWinAggregationPolicy(), minimumClusterSize: 1},
        );
        const generator = {
            generateSymbolsCombination: (): SymbolsCombination<string> =>
                new SymbolsCombination<string>().fromMatrix([
                    ["A"],
                    ["V"],
                    ["W"],
                ]),
        };
        const session = new VideoSlotSession(config, generator, calculator);

        session.play();

        const payload = new VideoSlotSessionSerializer().getRoundData(session);
        expect(payload.winEvaluationResult?.clusterWins).toHaveLength(1);
        expect(payload.winEvaluationResult?.valueWins).toHaveLength(1);
        expect(payload.winEvaluationResult?.waysWins).toHaveLength(1);
        expect(payload.winningClusters?.[0]?.winAmount).toBe(7);
        expect(payload.winningValues?.V?.winAmount).toBe(11);
        expect(payload.winningWays?.W?.winAmount).toBe(13);
        expect(payload.totalWin).toBe(payload.winEvaluationResult?.totalWin);
    });

    test("validation can be disabled on evaluate while preflight validation remains available", () => {
        const config = new VideoSlotConfig();
        config.setReelsNumber(3);
        const calculator = new VideoSlotWinCalculator(
            config,
            new LineWinCalculator(config),
            new ScatterWinCalculator(config),
            undefined,
            undefined,
            new WaysWinCalculator(config),
            {validateOnEvaluate: false},
        );
        const symbols = new SymbolsCombination().fromMatrix([
            ["A", "A", "K"],
            ["A", "A", "Q"],
            ["A", "K", "Q"],
        ]);

        expect(() => calculator.calculateWin(config.getAvailableBets()[0], symbols)).not.toThrow();
        expect(calculator.validateWinEvaluation(config.getAvailableBets()[0], symbols).hasErrors()).toBe(true);
        expect(calculator.getWinEvaluationPipeline().getOptions().validateOnEvaluate).toBe(false);
    });
});


test.each([true, false])("nonfinite component and aggregate payouts reject with pipeline validation %s", validateOnEvaluate => {
    const config = new VideoSlotConfig();
    const context = new WinEvaluationContext(config.getAvailableBets()[0], new SymbolsCombination().fromMatrix(Array.from({length: 5}, () => ["A", "A", "A"])), config);
    for (const amounts of [[Infinity], [NaN], [Number.MAX_VALUE, Number.MAX_VALUE]]) {
        const pipeline = new WinEvaluationPipeline<string>([{
            getEvaluatorId: () => "overflow",
            getEvaluatorGroup: () => "value",
            getComponentType: () => "value",
            evaluate: () => amounts.map(amount => new ValueWinComponent(new WinningValue("A", [[0, 0]], amount))),
        }], undefined, undefined, undefined, {validateOnEvaluate});
        expect(() => pipeline.evaluate(context)).toThrow(/overflow/);
    }
});


test("aggregation across finite evaluator totals cannot publish an infinite payout", () => {
    const config = new VideoSlotConfig();
    const pipeline = new WinEvaluationPipeline<string>(["first", "second"].map(id => ({
        getEvaluatorId: () => id,
        getEvaluatorGroup: () => id,
        getComponentType: () => "value",
        evaluate: () => [new ValueWinComponent(new WinningValue("A", [[0, 0]], Number.MAX_VALUE))],
    })), new SumAllEnabledWinAggregationPolicy(), undefined, undefined, {validateOnEvaluate: false});
    expect(() => pipeline.evaluate(new WinEvaluationContext(config.getAvailableBets()[0], new SymbolsCombination().fromMatrix(Array.from({length: 5}, () => ["A", "A", "A"])), config))).toThrow(/overflow/);
});
