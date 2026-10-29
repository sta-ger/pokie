import {
    AbstractVideoSlotSessionDecorator, SessionRuntime, CustomLinesDefinitions, VideoSlotSessionSerializer,
    Paytable, SeededRandomNumberGenerator, LineWinCalculator, ScatterWinCalculator, ClusterWinCalculator, WaysWinCalculator,
    VideoSlotWithBetModesSession, captureInitialPokieSessionState, VideoSlotSessionHandling, SessionStateRestoring,
    ClusterWinCalculating,
    FreeGamesRoundHandling,
    GameSession, GameSessionConfig,
    LeftToRightLinesPatterns,
    LineWinCalculating,
    ReelsSymbolsSequencesGenerating,
    ScatterWinCalculating,
    SumAllEnabledWinAggregationPolicy,
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
    MultiplierResolver,
    VideoSlotWithFreeGamesConfig,
    VideoSlotWithFreeGamesSession,
    WaysWinCalculating,
    WinningCluster,
    WinningClusterDescribing,
    WinningLine,
    WinningLineDescribing,
    WinningScatter,
    WinningScatterDescribing,
    WinningValue,
    WinningValueDescribing,
    WinningWay,
    WinningWayDescribing,
} from "@fromstan/pokie";

import * as api from "@fromstan/pokie";

import {legacyComposedGame, legacyCompositions} from "../../v2/fixtures/LegacyComposedGame.js";

describe("ExtensionPoints", () => {
    test.each(legacyCompositions)("preserves custom decorator execution and live-only capture in %s", composition => {
        for (const opaque of [false, true]) {
            const game = legacyComposedGame(composition, opaque),
                session = game.createSession();
            const runtime = new SessionRuntime(session);
            expect(runtime.execute({kind: "spin"})).toMatchObject({status: "played"});
            expect(runtime.execute({kind: "spin"})).toMatchObject({status: "played"});
            const state = captureInitialPokieSessionState(undefined, session, undefined, false, game);
            expect(state.executionState).toBe("live-only");
            let feature = state.featureState as {base?: unknown};
            while (feature.base !== undefined) feature = feature.base as typeof feature;
            if (opaque) expect(feature).toEqual(["opaque legacy snapshot", 2]);
            else expect(feature).not.toHaveProperty("base");
        }
    });
    test.each(["paytable", "config", "lines", "patterns", "sequence", "nested-line", "nested-scatter", "nested-cluster", "nested-ways", "calculator-config", "free-config"])("does not certify hidden state in %s collaborators", collaborator => {
        class CountingPaytable extends Paytable {
            public calls = 0;
            public override getWinAmountForSymbol(symbol: string, count: number, bet: number): number {
                return super.getWinAmountForSymbol(symbol, count, bet) + ++this.calls;
            }
        }
        class CountingConfig extends VideoSlotConfig {
            public calls = 0;
            public override getPaytable(): Paytable {
                this.calls++;
                return super.getPaytable() as Paytable;
            }
        }
        class CountingFreeConfig extends VideoSlotWithFreeGamesConfig {
            public calls = 0;
            public override getFreeGamesForScatters(symbol: string, count: number): number {
                return super.getFreeGamesForScatters(symbol, count) + ++this.calls;
            }
        }
        class CountingPatterns extends LeftToRightLinesPatterns {}
        class CountingSequence extends SymbolsSequence {}
        const config = collaborator === "config" ? new CountingConfig() : new VideoSlotConfig();
        const hidden = new VideoSlotConfig();
        hidden.setPaytable(new CountingPaytable(hidden.getAvailableBets()));
        if (collaborator === "paytable") config.setPaytable(new CountingPaytable(config.getAvailableBets()));
        if (collaborator === "lines") config.setLinesDefinitions({getLinesIds: () => ["0"], getLineDefinition: () => [0, 0, 0, 0, 0]});
        if (collaborator === "patterns") config.setLinesPatterns(new CountingPatterns(5));
        if (collaborator === "sequence") config.setSymbolsSequences(config.getSymbolsSequences().map(strip => new CountingSequence().fromArray(strip.getSymbols(0, strip.getSize()))));
        const calculator = new VideoSlotWinCalculator(collaborator === "calculator-config" ? hidden : config,
            new LineWinCalculator(collaborator === "nested-line" ? hidden : config),
            new ScatterWinCalculator(collaborator === "nested-scatter" ? hidden : config),
            collaborator === "nested-cluster" ? new ClusterWinCalculator(hidden) : undefined,
            undefined, collaborator === "nested-ways" ? new WaysWinCalculator(hidden) : undefined);
        let session: VideoSlotSessionHandling & SessionStateRestoring = new VideoSlotSession(config, new SymbolsCombinationsGenerator(config, new SeededRandomNumberGenerator(7)), calculator);
        expect(calculator.isStatelessForSessionRestoration()).toBe(collaborator === "free-config");
        if (collaborator === "free-config") {
            const free = new CountingFreeConfig(config);
            // The base codec is complete, but this outer configuration owns another counter.
            session = new VideoSlotWithFreeGamesSession(free, undefined, undefined, session);
        }
        expect(session.isSessionStateRestorable()).toBe(false);
        expect(captureInitialPokieSessionState(undefined, session).executionState).toBe("live-only");
        const modes = new VideoSlotWithBetModesSession(session);
        expect(modes.isSessionStateRestorable()).toBe(false);
        expect(captureInitialPokieSessionState(undefined, modes).executionState).toBe("live-only");
    });

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
        const calculator = new VideoSlotWinCalculator(config, noLines, noScatters, clusterWinCalculator, undefined, undefined, {
            aggregationPolicy: new SumAllEnabledWinAggregationPolicy(),
        });
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
        const calculator = new VideoSlotWinCalculator(config, noLines, noScatters, undefined, valueWinCalculator, undefined, {
            aggregationPolicy: new SumAllEnabledWinAggregationPolicy(),
        });
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

    test("VideoSlotWinCalculator omits ways wins when no WaysWinCalculating is injected (unchanged old behavior)", () => {
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

        expect(calculator.getWinningWays()).toEqual({});
        expect(calculator.getWaysWinning()).toBe(0);
    });

    test("VideoSlotWinCalculator folds an injected WaysWinCalculating into winningWays/winAmount", () => {
        const fixedWay = new WinningWay("A", [[0, 0], [1, 0], [1, 1]], 2, 30);

        const waysWinCalculator: WaysWinCalculating = {
            calculateWinningWays: (): Record<string, WinningWayDescribing> => ({A: fixedWay}),
        };

        const noLines: LineWinCalculating = {
            calculateWinningLines: (): Record<string, WinningLineDescribing> => ({}),
        };
        const noScatters: ScatterWinCalculating = {
            calculateWinningScatters: (): Record<string, WinningScatterDescribing> => ({}),
        };

        const config = new VideoSlotConfig();
        config.setReelsNumber(3);
        const calculator = new VideoSlotWinCalculator(
            config,
            noLines,
            noScatters,
            undefined,
            undefined,
            waysWinCalculator,
            {
                aggregationPolicy: new SumAllEnabledWinAggregationPolicy(),
            },
        );
        calculator.calculateWin(
            config.getAvailableBets()[0],
            new SymbolsCombination().fromMatrix([
                ["A", "A", "A"],
                ["A", "A", "A"],
                ["A", "A", "A"],
            ]),
        );

        expect(calculator.getWinningWays()).toEqual({A: fixedWay});
        expect(calculator.getWaysWinning()).toBe(30);
        expect(calculator.getWinAmount()).toBe(30);
    });

    test("VideoSlotWinCalculator exposes unified WinEvaluationResult and compatibility views derived from it", () => {
        const fixedLine = new WinningLine(42, [0, 0, 0], [1, 1, 1], "0", [0, 1, 2], [], "A");
        const fixedScatter = new WinningScatter("S", [[0, 0]], 7);
        const lineWinCalculator: LineWinCalculating = {
            calculateWinningLines: (): Record<string, WinningLineDescribing> => ({0: fixedLine}),
        };
        const scatterWinCalculator: ScatterWinCalculating = {
            calculateWinningScatters: (): Record<string, WinningScatterDescribing> => ({S: fixedScatter}),
        };
        const calculator = new VideoSlotWinCalculator(new VideoSlotConfig(), lineWinCalculator, scatterWinCalculator);

        calculator.calculateWin(
            1,
            new SymbolsCombination().fromMatrix([
                ["A", "A", "A"],
                ["A", "A", "A"],
                ["A", "A", "A"],
            ]),
        );

        const result = calculator.getWinEvaluationResult();
        expect(result.getTotalWin()).toBe(49);
        expect(result.getWinComponents()).toHaveLength(2);
        expect(calculator.getWinningLines()[0].getWinAmount()).toBe(42);
        expect(calculator.getWinningScatters().S.getWinAmount()).toBe(7);
    });

    test("VideoSlotWinCalculator validates incompatible evaluators without explicit aggregation policy", () => {
        const config = new VideoSlotConfig();
        config.setReelsNumber(3);
        const calculator = new VideoSlotWinCalculator(config, undefined, undefined, undefined, undefined, {
            calculateWinningWays: (): Record<string, WinningWayDescribing> => ({A: new WinningWay("A", [[0, 0]], 1, 5)}),
        });

        const validation = calculator.validateWinEvaluation(
            config.getAvailableBets()[0],
            new SymbolsCombination().fromMatrix([
                ["A", "A", "A"],
                ["A", "A", "A"],
                ["A", "A", "A"],
            ]),
        );

        expect(validation.hasErrors()).toBe(true);
        expect(validation.getIssues().some((issue) => issue.code === "incompatible-win-evaluators")).toBe(true);
    });

    test("VideoSlotWinCalculator applies multiplier resolver to unified result and compatibility view", () => {
        const fixedLine = new WinningLine(10, [0, 0], [1, 1], "0", [0, 1], [], "A");
        const lineWinCalculator: LineWinCalculating = {
            calculateWinningLines: (): Record<string, WinningLineDescribing> => ({0: fixedLine}),
        };
        const calculator = new VideoSlotWinCalculator(
            new VideoSlotConfig(),
            lineWinCalculator,
            {calculateWinningScatters: (): Record<string, WinningScatterDescribing> => ({})},
            undefined,
            undefined,
            undefined,
            {multiplierResolver: new MultiplierResolver({X2: 2})},
        );

        calculator.calculateWin(
            1,
            new SymbolsCombination().fromMatrix([
                ["X2", "A"],
                ["A", "K"],
            ]),
        );

        expect(calculator.getWinEvaluationResult().getTotalWin()).toBe(20);
        expect(calculator.getWinEvaluationResult().getMultiplierBreakdown()).toHaveLength(1);
        expect(calculator.getWinningLines()[0].getWinAmount()).toBe(20);
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

    test.each(["inherited", "super"].flatMap(kind => ["direct", "runtime", "prepared"].map(entry => ({kind, entry}))))(
        "F1g unchanged $kind forwarding extension recovers through $entry execution", ({kind, entry}) => {
            class InheritedForwarder extends AbstractVideoSlotSessionDecorator {}
            class SuperForwarder extends AbstractVideoSlotSessionDecorator {
                public override play(): void {
                    super.play();
                }
            }
            const config = new VideoSlotConfig();
            config.setAvailableBets([1]);
            config.setBet(1);
            config.setSymbolsSequences(Array.from({length: 5}, () => new SymbolsSequence().fromArray(["A"])));
            config.setLinesDefinitions(new CustomLinesDefinitions().setLineDefinition("line", [0, 0, 0, 0, 0]));
            const paytable = new Paytable<string>([1]);
            paytable.setPayoutForSymbol("A", 5, 9);
            config.setPaytable(paytable);
            const base = new VideoSlotSession(config, new SymbolsCombinationsGenerator(config, new SeededRandomNumberGenerator(31)));
            const session = kind === "inherited" ? new InheritedForwarder(base) : new SuperForwarder(base);
            session.setCreditsAmount(100);
            const runtime = new SessionRuntime(session);
            const execute = () => {
                if (entry === "direct") return session.play();
                if (entry === "runtime") return runtime.execute({kind: "spin"});
                const ready = runtime.prepare({kind: "spin"}, session.getCreditsAmount());
                if (ready.status !== "ready") throw new Error(ready.reason);
                return ready.execute();
            };
            execute();
            expect(session.getWinAmount()).toBe(9);
            const before = base.toSessionState();
            paytable.setPayoutForSymbol("A", 5, Number.MAX_VALUE);
            session.setCreditsAmount(Number.MAX_VALUE);
            expect(() => execute()).toThrow(/overflow/);
            expect(base.toSessionState()).toEqual(before);
            expect(session.getCreditsAmount()).toBe(Number.MAX_VALUE);
            expect(session.getWinAmount()).toBe(0);
            expect(session.getWinEvaluationResult().getWinComponents()).toEqual([]);
            session.setCreditsAmount(0);
            session.play();
            expect(session.getWinAmount()).toBe(0);
            expect(runtime.execute({kind: "spin", bet: 99})).toMatchObject({status: "invalid-command"});
            expect(session.getWinEvaluationResult().getWinComponents()).toEqual([]);
            paytable.setPayoutForSymbol("A", 5, 9);
            session.setCreditsAmount(108);
            for (const credits of [116, 124]) {
                const result = execute();
                if (entry !== "direct") expect(result).toMatchObject({status: "played", win: 9, credits});
                expect(session.getCreditsAmount()).toBe(credits);
                expect(session.getWinAmount()).toBe(9);
                expect(session.getWinEvaluationResult().getWinComponents()).toHaveLength(1);
                expect(session.getWinEvaluationResult()).toBe(base.getWinEvaluationResult());
                expect(new VideoSlotSessionSerializer().getRoundData(session)).toMatchObject({totalWin: 9, credits});
            }
        },
    );

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


test("finite settlement preserves the debit semantics of an injected base session", () => {
    const config = new VideoSlotConfig();
    const session = new VideoSlotSession(config, new SymbolsCombinationsGenerator(config, new SeededRandomNumberGenerator(7)), new VideoSlotWinCalculator(config), new DoubleDebitSession(config));
    const credits = session.getCreditsAmount();
    session.play();
    expect(session.getCreditsAmount()).toBe(credits - 2 * session.getBet() + session.getWinAmount());
});

// The existing injected debit extension is deliberately not an exact-payout provider.
class DoubleDebitSession extends GameSession {
    public override play(): void {
        this.setCreditsAmount(this.getCreditsAmount() - 2 * this.getBet());
    }
}

function accountingFixture(doubleDebit = true) {
    const config = new VideoSlotWithFreeGamesConfig();
    config.setAvailableBets([1]);
    config.setBet(1);
    config.setCreditsAmount(1000);
    config.setWildSymbols([]);
    config.setScatterSymbols([]);
    config.setSymbolsSequences(Array.from({length: 5}, () => new SymbolsSequence().fromArray(["A"])));
    config.setPaytable(new Paytable([1]));
    const generator = new SymbolsCombinationsGenerator(config, {getRandomInt: () => 0});
    const calculator = new VideoSlotWinCalculator(config);
    const base = new VideoSlotSession(config, generator, calculator, doubleDebit ? new DoubleDebitSession(config) : new GameSession(config));
    return {config, generator, calculator, base};
}

const accountingWrappers: Record<string, (fixture: ReturnType<typeof accountingFixture>) => VideoSlotSessionHandling & api.ConvertableToSessionState> = {
    direct: ({base}) => base,
    free: ({base, config, generator, calculator}) => new VideoSlotWithFreeGamesSession(config, generator, calculator, base),
    bet: ({base}) => new VideoSlotWithBetModesSession(base),
    hold: ({base}) => new api.VideoSlotWithHoldAndWinSession(base),
    jackpot: ({base}) => new api.VideoSlotWithJackpotSession(base),
    nested: fixture => new api.VideoSlotWithJackpotSession(new VideoSlotWithBetModesSession(
        new VideoSlotWithFreeGamesSession(fixture.config, fixture.generator, fixture.calculator, fixture.base))),
};

describe("V2C-37-PAYOUT-CUSTOM accounting capability", () => {
    test.each(Object.keys(accountingWrappers))("%s retains injected debit and signed logical settlement", wrapper => {
        const session = accountingWrappers[wrapper](accountingFixture());
        expect(session.getPayoutAmount?.()).toBeUndefined();
        const result = new SessionRuntime(session).execute({kind: "spin", roundId: "custom", delivery: "composite"});
        expect(result).toMatchObject({status: "played", credits: 998, win: 0, payout: -1, logicalRound: {totalPayout: -1}});
        if (result.status !== "played") throw new Error(result.reason);
        expect(api.validateLogicalRound(result.logicalRound)).toBeUndefined();
        expect(api.validateLogicalRound({...result.logicalRound, retention: "latest"})).toBeUndefined();
        expect(session.getPayoutAmount?.()).toBeUndefined();
    });

    test.each(Object.keys(accountingWrappers))("%s preserves signed wallet settlement, retry and offline audit replay", async wrapper => {
        const initialFeature = accountingWrappers[wrapper](accountingFixture()).toSessionState();
        const game: api.PokieGame = {
            getManifest: () => ({id: "double-debit", name: "Double debit", version: "1"}),
            getConfigHash: () => `sha256:${"a".repeat(64)}`,
            supportsLogicalRoundDelivery: () => true,
            getSessionStateSchema: () => ({kind: "custom"}),
            getSessionCommandCapabilities: () => ({bets: [1], ...(["bet", "nested"].includes(wrapper) ? {modes: ["base"]} : {})}),
            validateSessionState: state => {
                const normalize = (value: unknown): unknown => {
                    if (!value || typeof value !== "object" || Array.isArray(value)) return value;
                    const {chargedBetModeId, ...rest} = value as Record<string, unknown>;
                    if (chargedBetModeId !== undefined && chargedBetModeId !== "base") throw new Error("Invalid charged fixture mode");
                    return Object.fromEntries(Object.entries(rest).map(([key, item]) => [key, normalize(item)]));
                };
                if (JSON.stringify(api.toCanonicalJson(normalize(state))) !== JSON.stringify(api.toCanonicalJson(initialFeature))) throw new Error("Invalid deterministic fixture state");
            },
            createSession: () => {
                const session = accountingWrappers[wrapper](accountingFixture());
                const restore = Reflect.get(session, "fromSessionState") as (state: unknown) => unknown;
                // This fixture has constant strips, no grants/pools/triggers or retained RNG.
                // Its explicit codec owns the complete deterministic continuation, unlike an
                // inherited built-in codec on an arbitrary custom extension.
                return Object.assign(session, {
                    getSessionStateSchema: () => ({kind: "custom" as const}),
                    isSessionStateRestorable: () => true,
                    validateSessionState: (state: unknown) => game.validateSessionState!(state),
                    fromSessionState: (state: unknown) => {
                        // Keep wrapper bookkeeping (including charged mode); the constant leaf
                        // has no RNG/feature continuation to restore.
                        if (wrapper !== "direct") Reflect.apply(restore, session, [state]);
                        return session;
                    },
                });
            },
        };
        const repository = new api.InMemorySessionRepository();
        await repository.save("custom", captureInitialPokieSessionState(undefined, game.createSession(), undefined, false, game));
        const wallet = new api.InMemoryWallet(1000);
        const handler = new api.SpinCommandHandler(game, repository, wallet);
        const command: api.RepositoryCommand = {kind: "spin", sessionId: "custom", requestId: "once", roundId: "signed", delivery: "composite"};
        const result = await handler.execute(command);
        if (result.status !== "played") throw new Error(JSON.stringify(result));
        expect(result).toMatchObject({status: "played", credits: 998, state: {logicalRound: {totalPayout: -1}}});
        expect(result.audit!.deliveries[0].disposition.walletPayout).toBe(-1);
        expect(new api.AuditRoundReplay().replay(game, JSON.parse(JSON.stringify(result.audit))).verification).toBe("verified");
        expect(await handler.execute(command)).toEqual(result);
        expect(await wallet.getBalance("custom")).toBe(998);
        expect((await repository.load("custom"))!.credits).toBe(998);
    });

    test.each(["free", "bet", "hold", "jackpot"])("%s handler credit changes survive and rejection rolls back", kind => {
        for (const doubleDebit of [false, true]) {
            const {base, config, generator, calculator} = accountingFixture(doubleDebit);
            config.setLinesDefinitions(new CustomLinesDefinitions().setLineDefinition("line", [0, 0, 0, 0, 0]));
            config.getPaytable().setPayoutForSymbol("A", 5, 3);
            let reject = false;
            const adjust = (session: VideoSlotSessionHandling) => {
                session.setCreditsAmount(session.getCreditsAmount() + 17);
                if (reject) throw new Error("custom handler rejected");
            };
            const modes = new api.BetModesConfig([new api.BetModeDefinition("base"), new api.BetModeDefinition("buy", {forcesFeatureEntry: true})]);
            let session: VideoSlotSessionHandling;
            if (kind === "free") session = new VideoSlotWithFreeGamesSession(config, generator, calculator, base, {
                beforeRoundPlayed: () => undefined, afterRoundPlayed: adjust,
            });
            else if (kind === "hold") session = new api.VideoSlotWithHoldAndWinSession(base, 3, undefined, undefined, undefined, {
                beforeRoundPlayed: () => undefined, afterRoundPlayed: adjust,
            });
            else if (kind === "jackpot") session = new api.VideoSlotWithJackpotSession(base, [], undefined, undefined, undefined, {afterRoundPlayed: adjust});
            else session = new VideoSlotWithBetModesSession(base, modes, {canForceFeatureEntry: () => true, forceFeatureEntry: adjust});
            if (session instanceof VideoSlotWithBetModesSession) session.setBetMode("buy");
            session.play();
            const expected = doubleDebit ? 1018 : 1019;
            expect(session.getCreditsAmount()).toBe(expected);
            expect(session.getWinAmount()).toBe(3);
            expect(session.getWinEvaluationResult().getWinComponents()).toHaveLength(1);
            expect(session.getPayoutAmount?.()).toBeUndefined();
            reject = true;
            if (session instanceof VideoSlotWithBetModesSession) session.setBetMode("buy");
            expect(() => session.play()).toThrow("custom handler rejected");
            expect(session.getCreditsAmount()).toBe(expected);
            expect(session.getWinAmount()).toBe(0);
            expect(session.getWinEvaluationResult().getWinComponents()).toEqual([]);
        }
    });

    test("inherited session payout does not certify subclass accounting; explicit contracts compose", () => {
        const {config, generator, calculator} = accountingFixture(false);
        class AdjustedVideoSession extends VideoSlotSession {
            public override play(): void {
                super.play();
                this.setCreditsAmount(this.getCreditsAmount() + 17);
            }
        }
        const session = new api.VideoSlotWithJackpotSession(new AdjustedVideoSession(config, generator, calculator));
        expect(new SessionRuntime(session).execute({kind: "spin", delivery: "composite", roundId: "subclass"})).toMatchObject({credits: 1016, payout: 17});
        class AdjustedBetMode extends VideoSlotWithBetModesSession {
            public override play(): void {
                super.play();
                this.setCreditsAmount(this.getCreditsAmount() + 17);
            }
        }
        const adjustedWrapper = new api.VideoSlotWithJackpotSession(new AdjustedBetMode(accountingFixture(false).base));
        expect(new SessionRuntime(adjustedWrapper).execute({kind: "spin", delivery: "composite", roundId: "wrapper-subclass"})).toMatchObject({credits: 1016, payout: 17});
        class ExactDoubleDebit extends DoubleDebitSession {
            public getPayoutAmount(): number {
                return -this.getBet();
            }
        }
        const exact = new VideoSlotWithBetModesSession(new VideoSlotSession(config, generator, calculator, new ExactDoubleDebit(config)));
        expect(new SessionRuntime(exact).execute({kind: "spin", delivery: "composite", roundId: "explicit"})).toMatchObject({credits: 998, payout: -1});
        expect(exact.getPayoutAmount()).toBe(-1);
    });
});
