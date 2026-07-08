import {
    AbstractVideoSlotSessionDecorator,
    ClusterWinCalculating,
    FreeGamesRoundHandling,
    GameSessionConfig,
    LeftToRightLinesPatterns,
    LineWinCalculating,
    ReelsSymbolsSequencesGenerating,
    ScatterWinCalculating,
    SymbolsCombination,
    SymbolsCombinationDescribing,
    SymbolsCombinationsAnalyzer,
    SymbolsCombinationsGenerator,
    SymbolsSequence,
    SymbolsSequenceDescribing,
    ValueWinCalculating,
    VideoSlotConfig,
    VideoSlotSession,
    VideoSlotWinCalculator,
    VideoSlotWithFreeGamesConfig,
    VideoSlotWithFreeGamesSession,
    WinningCluster,
    WinningClusterDescribing,
    WinningLine,
    WinningLineDescribing,
    WinningScatter,
    WinningScatterDescribing,
    WinningValue,
    WinningValueDescribing,
} from "pokie";

describe("ExtensionPoints", () => {
    test("VideoSlotWinCalculator delegates to injected LineWinCalculating/ScatterWinCalculating", () => {
        const fixedLine = new WinningLine(42, [0, 0, 0], [1, 1, 1], "0", [0, 1, 2], [], "A");
        const fixedScatter = new WinningScatter("S", [[0, 0]], 7);

        const lineWinCalculator: LineWinCalculating = {
            calculateWinningLines: (): Record<string, WinningLineDescribing> => ({0: fixedLine}),
        };
        const scatterWinCalculator: ScatterWinCalculating = {
            calculateWinningScatters: (): Record<string, WinningScatterDescribing> => ({S: fixedScatter}),
        };

        const config = new VideoSlotConfig();
        const calculator = new VideoSlotWinCalculator(config, lineWinCalculator, scatterWinCalculator);
        calculator.calculateWin(
            config.getAvailableBets()[0],
            new SymbolsCombination().fromMatrix([
                ["A", "A", "A"],
                ["A", "A", "A"],
                ["A", "A", "A"],
            ]),
        );

        expect(calculator.getWinningLines()).toEqual({0: fixedLine});
        expect(calculator.getWinningScatters()).toEqual({S: fixedScatter});
        expect(calculator.getWinAmount()).toBe(49);
    });

    test("VideoSlotWinCalculator omits cluster wins when no ClusterWinCalculating is injected (unchanged old behavior)", () => {
        const config = new VideoSlotConfig();
        config.setReelsNumber(3);
        const calculator = new VideoSlotWinCalculator(config);
        calculator.calculateWin(
            config.getAvailableBets()[0],
            new SymbolsCombination().fromMatrix([
                ["A", "A", "A"],
                ["A", "A", "A"],
                ["A", "A", "A"],
            ]),
        );

        expect(calculator.getWinningClusters()).toEqual({});
        expect(calculator.getClustersWinning()).toBe(0);
    });

    test("VideoSlotWinCalculator folds an injected ClusterWinCalculating into winningClusters/winAmount", () => {
        const fixedCluster = new WinningCluster("A", [[0, 0], [0, 1], [1, 0]], 15);

        const clusterWinCalculator: ClusterWinCalculating = {
            calculateWinningClusters: (): Record<string, WinningClusterDescribing> => ({0: fixedCluster}),
        };

        const noLines: LineWinCalculating = {
            calculateWinningLines: (): Record<string, WinningLineDescribing> => ({}),
        };
        const noScatters: ScatterWinCalculating = {
            calculateWinningScatters: (): Record<string, WinningScatterDescribing> => ({}),
        };

        const config = new VideoSlotConfig();
        config.setReelsNumber(3);
        const calculator = new VideoSlotWinCalculator(config, noLines, noScatters, clusterWinCalculator);
        calculator.calculateWin(
            config.getAvailableBets()[0],
            new SymbolsCombination().fromMatrix([
                ["A", "A", "A"],
                ["A", "A", "A"],
                ["A", "A", "A"],
            ]),
        );

        expect(calculator.getWinningClusters()).toEqual({0: fixedCluster});
        expect(calculator.getClustersWinning()).toBe(15);
        expect(calculator.getWinAmount()).toBe(15);
    });

    test("VideoSlotWinCalculator omits value wins when no ValueWinCalculating is injected (unchanged old behavior)", () => {
        const config = new VideoSlotConfig();
        config.setReelsNumber(3);
        const calculator = new VideoSlotWinCalculator(config);
        calculator.calculateWin(
            config.getAvailableBets()[0],
            new SymbolsCombination().fromMatrix([
                ["A", "A", "A"],
                ["A", "A", "A"],
                ["A", "A", "A"],
            ]),
        );

        expect(calculator.getWinningValues()).toEqual({});
        expect(calculator.getValuesWinning()).toBe(0);
    });

    test("VideoSlotWinCalculator folds an injected ValueWinCalculating into winningValues/winAmount", () => {
        const fixedValue = new WinningValue("A", [[0, 0], [1, 1]], 20);

        const valueWinCalculator: ValueWinCalculating = {
            calculateWinningValues: (): Record<string, WinningValueDescribing> => ({A: fixedValue}),
        };

        const noLines: LineWinCalculating = {
            calculateWinningLines: (): Record<string, WinningLineDescribing> => ({}),
        };
        const noScatters: ScatterWinCalculating = {
            calculateWinningScatters: (): Record<string, WinningScatterDescribing> => ({}),
        };

        const config = new VideoSlotConfig();
        config.setReelsNumber(3);
        const calculator = new VideoSlotWinCalculator(config, noLines, noScatters, undefined, valueWinCalculator);
        calculator.calculateWin(
            config.getAvailableBets()[0],
            new SymbolsCombination().fromMatrix([
                ["A", "A", "A"],
                ["A", "A", "A"],
                ["A", "A", "A"],
            ]),
        );

        expect(calculator.getWinningValues()).toEqual({A: fixedValue});
        expect(calculator.getValuesWinning()).toBe(20);
        expect(calculator.getWinAmount()).toBe(20);
    });

    test("VideoSlotConfig delegates reel-strip generation to injected ReelsSymbolsSequencesGenerating", () => {
        const fixedSequence = new SymbolsSequence().fromArray(["Z", "Z", "Z"]);
        const sequencesGenerator: ReelsSymbolsSequencesGenerating = {
            generate: (reelsNumber: number): SymbolsSequenceDescribing[] =>
                new Array(reelsNumber).fill(0).map(() => fixedSequence),
        };

        const config = new VideoSlotConfig(new GameSessionConfig(), sequencesGenerator);

        expect(config.getSymbolsSequences()).toHaveLength(config.getReelsNumber());
        config.getSymbolsSequences().forEach((sequence) => {
            expect(sequence.toArray()).toEqual(["Z", "Z", "Z"]);
        });
    });

    test("VideoSlotWithFreeGamesSession delegates bank/retrigger bookkeeping to injected FreeGamesRoundHandling", () => {
        const calls: string[] = [];
        const freeGamesRoundHandler: FreeGamesRoundHandling = {
            beforeRoundPlayed: (): void => {
                calls.push("before");
            },
            afterRoundPlayed: (): void => {
                calls.push("after");
            },
        };

        const config = new VideoSlotWithFreeGamesConfig();
        const combinationsGenerator = new SymbolsCombinationsGenerator(config);
        const winCalculator = new VideoSlotWinCalculator(config);
        const baseSession = new VideoSlotSession(config, combinationsGenerator, winCalculator);
        const session = new VideoSlotWithFreeGamesSession(
            config,
            combinationsGenerator,
            winCalculator,
            baseSession,
            freeGamesRoundHandler,
        );

        session.play();

        expect(calls).toEqual(["before", "after"]);
    });

    test("AbstractVideoSlotSessionDecorator forwards everything except what a subclass overrides", () => {
        class FixedBetDecorator<
            T extends string | number | symbol = string,
        > extends AbstractVideoSlotSessionDecorator<T> {
            public override getBet(): number {
                return 999999;
            }
        }

        const config = new VideoSlotConfig();
        const baseSession = new VideoSlotSession(config);
        const decorator = new FixedBetDecorator(baseSession);

        expect(decorator.getBet()).toBe(999999);
        expect(decorator.getReelsNumber()).toBe(baseSession.getReelsNumber());
        expect(decorator.getAvailableSymbols()).toEqual(baseSession.getAvailableSymbols());
        expect(decorator.canPlayNextGame()).toBe(baseSession.canPlayNextGame());
    });

    test("wildSubstitutions restricts which target symbols a wild counts towards", () => {
        // "W" only substitutes for "A", not for "K"
        const wildSubstitutions = {W: ["A"]};

        expect(SymbolsCombinationsAnalyzer.isMatchPattern(["A", "W", "A"], [1, 1, 1], ["W"], wildSubstitutions)).toBe(
            true,
        );
        expect(SymbolsCombinationsAnalyzer.isMatchPattern(["K", "W", "K"], [1, 1, 1], ["W"], wildSubstitutions)).toBe(
            false,
        );
        // unrestricted default behavior is unchanged when wildSubstitutions is omitted
        expect(SymbolsCombinationsAnalyzer.isMatchPattern(["K", "W", "K"], [1, 1, 1], ["W"])).toBe(true);

        const patterns = new LeftToRightLinesPatterns(3).toArray();
        expect(
            SymbolsCombinationsAnalyzer.getMatchingPattern(["K", "W", "K"], patterns, ["W"], wildSubstitutions),
        ).toBeNull();
        expect(SymbolsCombinationsAnalyzer.getMatchingPattern(["K", "W", "K"], patterns, ["W"])).toEqual([1, 1, 1]);
    });

    test("VideoSlotConfig.setWildSubstitutions flows through to VideoSlotWinCalculator", () => {
        const config = new VideoSlotConfig();
        config.setReelsNumber(3);
        config.setWildSubstitutions({W: ["A"]});

        const calculator = new VideoSlotWinCalculator(config);
        const bet = config.getAvailableBets()[0];

        // Reel-major matrix (combination[reelId][rowIndex]): row 0 across reels is "K","W","K" —
        // a wild restricted to substituting only for "A" must not complete this line.
        const combinationWithDisallowedTarget: SymbolsCombinationDescribing = new SymbolsCombination().fromMatrix([
            ["K", "10", "9"],
            ["W", "J", "Q"],
            ["K", "A", "J"],
        ]);
        calculator.calculateWin(bet, combinationWithDisallowedTarget);
        expect(Object.keys(calculator.getWinningLines())).toHaveLength(0);

        // Same shape, but row 0 is "A","W","A" — the wild is allowed to substitute for "A".
        const combinationWithAllowedTarget: SymbolsCombinationDescribing = new SymbolsCombination().fromMatrix([
            ["A", "10", "9"],
            ["W", "J", "Q"],
            ["A", "A", "J"],
        ]);
        calculator.calculateWin(bet, combinationWithAllowedTarget);
        expect(Object.keys(calculator.getWinningLines())).toHaveLength(1);
    });
});
