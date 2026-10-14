import {
    ScreenProjection, SymbolsCombination, SymbolsCombinationsGenerator, SeededRandomNumberGenerator,
    VideoSlotSession, VideoSlotSessionSerializer, VideoSlotWinCalculator, LineWinCalculator, ScatterWinCalculator,
    WaysWinCalculator, ClusterWinCalculator, ClusterWinEvaluator, ValueWinCalculator, WinEvaluationContext, WinEvaluationPipeline, WinEvaluationResult,
    CustomLinesDefinitions, LineWinComponent, WinningLine,
    VideoSlotWithFreeGamesConfig, VideoSlotWithFreeGamesSession, buildRoundArtifactFromSession, buildRoundArtifact,
    PokieJsonRoundArtifactProjector, PublicRoundArtifactProjector, RoundArtifactValidator, computeRoundArtifactHash,
    captureInitialPokieSessionState, captureRoundPokieSessionState, validatePersistedSession,
    Simulation, SimulationConfig, ReplayRecorder, SessionRuntime, SpinCommandHandler,
    InMemorySessionRepository, InMemoryWallet, InMemoryIdempotencyRepository, InMemorySpinOperationLog,
    GameBlueprintValidator, buildGameModelProjection, generateExactWeightedOutcomeLibrary,
    resolveCanonicalWasmGameModel, prepareBlueprintForParSheetExport,
    WeightedOutcomeLibraryGenerationCancelledError, ValueWinComponent, WinningValue, MultiplierResolver,
    PreGeneratedRoundResultProjector, buildPreGeneratedRoundResult, buildWeightedOutcomeLibrary, computeWeightedOutcomeLibraryHash,
    StakeEngineRoundEventsProjector, LocalJsonExternalRoundProjector,
    sessionStateSchemasMatch, HorizontalLines, Paytable, VariableHeightSymbolsCombinationsGenerator, ResizableSymbolsCombinationsGenerator, SymbolsSequence,
    CascadingSpinResolver, VideoSlotWithHoldAndWinSession, VideoSlotWithJackpotSession, AccumulatingJackpotPool, PercentageOfBetJackpotContributor, SymbolCountJackpotTrigger, VideoSlotWithBetModesSession, BetModesConfig, BetModeDefinition,
    type SpinCommandResult, type ScreenGeometry, type VideoSlotSessionHandling, type WinEvaluator,
} from "@fromstan/pokie";
import {serializeGameBlueprint} from "../../cli/studio/blueprint/serializeGameBlueprint.js";
import {adversarialScreen, createOverscanGame, overscanBlueprint, overscanConfig, overscanGeometry} from "./fixtures/OverscanGame.js";

const provenance = {game: overscanBlueprint.manifest, pokieVersion: "1.3.0"};
const combination = (screen = adversarialScreen()) => new SymbolsCombination().fromMatrix(screen).withCoordinates(overscanGeometry);

function fixedSession(screen = adversarialScreen()): VideoSlotSession {
    const config = overscanConfig();
    return new VideoSlotSession(config, {generateSymbolsCombination: () => combination(screen)});
}

describe("Generated / visible / evaluated screen contracts", () => {
    it("round-trips every represented cell and composes distinct windows", () => {
        const projection = new ScreenProjection(overscanGeometry);
        for (let reel = 0;
            reel < 5;
            reel++) {
            for (let row = 0;
                row < 7;
                row++) {
                for (const space of ["visible", "evaluated"] as const) {
                    const mapped = projection.map([reel, row], "generated", space);
                    if (mapped) expect(projection.map(mapped, space, "generated")).toEqual([reel, row]);
                    if (space === "visible" && mapped) {
                        expect(projection.map(mapped, "visible", "evaluated")).toEqual(projection.map([reel, row], "generated", "evaluated"));
                    }
                }
            }
        }
        expect(projection.map([0, 0], "generated", "visible")).toBeNull();
        expect(projection.map([4, 6], "generated", "evaluated")).toBeNull();
        expect(projection.map([4, 4], "generated", "evaluated")).toEqual([4, 2]);
    });

    it("retains clipped cell identity and coverage independently of payout", () => {
        const geometry: ScreenGeometry = {...overscanGeometry, visible: {rowOffset: 1.25, rows: 2.5}};
        const projection = new ScreenProjection(geometry);
        expect(projection.getVisibleCoverage()).toEqual([0.75, 1, 0.75]);
        expect(projection.map([0, 0], "visible", "generated")).toEqual([0, 1]);
        expect(projection.map([0, 0], "visible", "evaluated")).toBeNull();
        expect(projection.map([4, 2], "visible", "generated")).toEqual([4, 3]);
        const config = overscanConfig();
        config.setScreenGeometry(geometry);
        const session = new VideoSlotSession(config, {generateSymbolsCombination: () => new SymbolsCombination().fromMatrix(adversarialScreen()).withCoordinates(geometry)});
        session.play();
        expect(new VideoSlotSessionSerializer().getRoundData(session)).toMatchObject({visibleRowCoverage: [0.75, 1, 0.75], totalWin: 3});
    });

    it.each([
        {...overscanGeometry, generated: {reels: 0, rows: 7}},
        {...overscanGeometry, generated: {reels: 5, rows: NaN}},
        {...overscanGeometry, visible: {rowOffset: -1, rows: 3}},
        {...overscanGeometry, visible: {rowOffset: Infinity, rows: 3}},
        {...overscanGeometry, visible: {rowOffset: 6.5, rows: 1}},
        {...overscanGeometry, visible: {rowOffset: 1, rows: 0}},
        {...overscanGeometry, evaluated: {rowOffset: 2.5, rows: 3}},
        {...overscanGeometry, evaluated: {rowOffset: 2, rows: 0.5}},
        {...overscanGeometry, visible: {rowOffset: [1, 2], rows: 3}},
        {...overscanGeometry, visible: {rowOffset: 1, rows: 3, reelOffsets: [1, 2]}},
        {...overscanGeometry, paylineSpace: "generated"},
    ])("rejects malformed and unsupported geometry %j", geometry => {
        expect(() => new ScreenProjection(geometry as ScreenGeometry)).toThrow();
        expect(new GameBlueprintValidator().validate({...overscanBlueprint, screenGeometry: geometry}).some(issue => issue.code === "blueprint-screen-geometry-invalid")).toBe(true);
    });

    it("rejects fractional cell indexes, malformed matrices and visible inputs to evaluators", () => {
        const projection = new ScreenProjection(overscanGeometry);
        expect(() => projection.map([0, 0.5], "generated", "visible")).toThrow(/integer/);
        expect(() => projection.map(new Array<number>(2), "generated", "visible")).toThrow(/integer/);
        expect(() => projection.project(new Array<string[]>(5), "visible")).toThrow(/dimensions/);
        expect(() => projection.project([["A"]], "visible")).toThrow(/dimensions/);
        const visible = new SymbolsCombination().fromMatrix(projection.project(adversarialScreen(), "visible")).withCoordinates(overscanGeometry, "visible");
        expect(() => new WinEvaluationContext(1, visible, overscanConfig())).toThrow(/visible screen/);
    });

    it("never pays adversarial off-window scatters, wilds or complete lines through direct payout APIs", () => {
        const config = overscanConfig();
        const generated = combination();
        const calculator = new VideoSlotWinCalculator(config);
        calculator.calculateWin(1, generated);
        expect(calculator.getWinAmount()).toBe(3);
        expect(Object.keys(new ScatterWinCalculator(config).calculateWinningScatters(1, generated))).toEqual([]);
        expect(Object.values(new LineWinCalculator(config).calculateWinningLines(1, generated)).map(line => line.getSymbolId())).toEqual(["B", "B", "B"]);
        expect(new WaysWinCalculator(config).calculateWinningWays(1, generated).B.getWinAmount()).toBe(243);
        config.getPaytable().setPayoutForSymbol("B", 15, 2);
        expect(Object.values(new ClusterWinCalculator(config).calculateWinningClusters(1, generated)).map(win => win.getWinAmount())).toEqual([2]);
        const values = new ValueWinCalculator<string>({S: 100000, W: 200000, A: 300000, B: 1}).calculateWinningValues(1, generated);
        expect(Object.keys(values)).toEqual(["B"]);
        expect(values.B.getWinAmount()).toBe(15);
    });

    it.each([1, 2, 4, 5])("crosses each evaluation boundary exactly once (generated row %s)", row => {
        const matrix = adversarialScreen();
        matrix[0][row] = "S";
        const scatters = new ScatterWinCalculator(overscanConfig()).calculateWinningScatters(1, combination(matrix));
        expect(scatters.S?.getWinAmount() ?? 0).toBe(row === 2 || row === 4 ? 1000 : 0);
    });

    it.each([1, 2, 4, 5])("uses wild substitution only inside evaluation (generated row %s)", row => {
        const screen = adversarialScreen();
        const evaluationRow = row < 3 ? 2 : 4;
        for (let reel = 1;
            reel < 5;
            reel++) screen[reel][evaluationRow] = "A";
        screen[0][row] = "W";
        const wins = new LineWinCalculator(overscanConfig()).calculateWinningLines(1, combination(screen));
        expect(Object.values(wins).some(win => win.getSymbolId() === "A")).toBe(row === 2 || row === 4);
    });

    it("rejects unsupported feature and variable-grid adapters before generation or execution", () => {
        const config = overscanConfig();
        const rng = {getRandomInt: jest.fn(() => 0)};
        expect(() => new VariableHeightSymbolsCombinationsGenerator(config, Array.from({length: 5}, () => new SymbolsSequence<number>().fromArray([3])), rng).generateSymbolsCombination()).toThrow(/does not support overscan/);
        expect(() => new ResizableSymbolsCombinationsGenerator(config, [3, 3, 3, 3, 3], rng).generateSymbolsCombination()).toThrow(/does not support overscan/);
        expect(rng.getRandomInt).not.toHaveBeenCalled();
        const session = fixedSession();
        const credits = session.getCreditsAmount();
        expect(() => new VideoSlotWithHoldAndWinSession(session).play()).toThrow(/does not support overscan/);
        expect(() => new VideoSlotWithJackpotSession(session).play()).toThrow(/does not support overscan/);
        const refill = {getRefillSymbols: jest.fn(() => [])};
        expect(() => new CascadingSpinResolver(new WinEvaluationPipeline([]), config, refill).resolve(adversarialScreen(), 1)).toThrow(/does not support overscan/);
        expect(refill.getRefillSymbols).not.toHaveBeenCalled();
        expect(session.getCreditsAmount()).toBe(credits);
        config.setScreenGeometry(undefined);
        const ragged = new ResizableSymbolsCombinationsGenerator(config, [2, 3, 4, 5, 6], rng).generateSymbolsCombination();
        expect(ragged.toMatrix().map(reel => reel.length)).toEqual([2, 3, 4, 5, 6]);
        expect(ragged.getScreenGeometry?.()).toBeUndefined();
        expect(() => new LineWinCalculator(config).calculateWinningLines(1, ragged)).toThrow(/evaluation domain/);
        config.setLinesDefinitions(new HorizontalLines(5, 3));
        expect(() => new LineWinCalculator(config).calculateWinningLines(1, ragged)).not.toThrow();
    });

    it.each([false, true])("F1 preserves a three-symbol default row award on an ordinary ragged grid (tagged %s)", tagged => {
        const config = overscanConfig();
        config.setScreenGeometry(undefined);
        config.setLinesDefinitions(new HorizontalLines(5, 3));
        const paytable = new Paytable<string>([1]);
        paytable.setPayoutForSymbol("A", 3, 10);
        config.setPaytable(paytable);
        const generated = new SymbolsCombination().fromMatrix([3, 3, 3, 2, 2].map(rows => Array<string>(rows).fill("A")));
        if (tagged) generated.withVariableReelHeights();
        const lines = new LineWinCalculator(config).calculateWinningLines(1, generated);
        expect(lines["2"].getWinAmount()).toBe(10);
        expect(lines["2"].getSymbolsPositions()).toEqual([0, 1, 2]);
        const session = new VideoSlotSession(config, {generateSymbolsCombination: () => generated});
        session.play();
        expect(session.getWinAmount()).toBe(10);
        expect(session.getWinningLines()["2"].getWinAmount()).toBe(10);
        expect(session.getSymbolsCombination().toMatrix().map(reel => reel.length)).toEqual([3, 3, 3, 2, 2]);
    });

    it.each([false, true])("F2 rejects sparse setLineDefinition paylines before generation or settlement (overscan %s)", overscan => {
        const config = overscanConfig();
        if (!overscan) config.setScreenGeometry(undefined);
        const generator = {generateSymbolsCombination: jest.fn(() => overscan ? combination() : new SymbolsCombination().fromMatrix(Array.from({length: 5}, () => ["B", "B", "B"])))};
        const session = new VideoSlotSession(config, generator);
        session.play();
        const credits = session.getCreditsAmount();
        generator.generateSymbolsCombination.mockClear();
        const line = new Array<number>(5);
        line[0] = line[1] = line[2] = 0;
        config.setLinesDefinitions(new CustomLinesDefinitions().setLineDefinition("sparse", line));
        expect(() => new LineWinCalculator(config).calculateWinningLines(1, session.getSymbolsCombination())).toThrow(/evaluation domain/);
        expect(() => session.play()).toThrow(/evaluation domain/);
        expect(generator.generateSymbolsCombination).not.toHaveBeenCalled();
        expect(session.getCreditsAmount()).toBe(credits);
        expect(session.getWinAmount()).toBe(0);
        expect(session.getWinningLines()).toEqual({});
        expect(() => new VideoSlotSession(config, generator)).toThrow(/evaluation domain/);
    });

    it("F8 legacy tags discover evaluation rows beyond the viewport at construction and retain them through play", () => {
        const config = overscanConfig();
        config.setScreenGeometry(undefined);
        config.setLinesDefinitions(new CustomLinesDefinitions().setLineDefinition("high", [3, 3, 3, 3, 3]));
        const geometry = {...overscanGeometry, evaluated: {rowOffset: 2, rows: 4}};
        const screen = Array.from({length: 5}, () => ["S", "S", "A", "A", "A", "A", "S"]);
        const generator = {generateSymbolsCombination: jest.fn(() => new SymbolsCombination().fromMatrix(screen).withCoordinates(geometry))};
        const direct = new LineWinCalculator(config).calculateWinningLines(1, generator.generateSymbolsCombination());
        expect(direct.high.getWinAmount()).toBe(10000);
        const base = new VideoSlotSession(config, generator);
        const credits = base.getCreditsAmount();
        base.play();
        expect(base.getWinAmount()).toBe(direct.high.getWinAmount());
        const ante = new VideoSlotWithBetModesSession(base, new BetModesConfig([
            new BetModeDefinition("base"), new BetModeDefinition("ante", {stakeMultiplier: 2}),
        ]));
        expect(new SessionRuntime(ante).execute({kind: "spin", mode: "ante"})).toMatchObject({status: "played", win: 10000});
        expect(ante.getCreditsAmount()).toBe(credits + 20000 - 3);
        expect(ante.getEvaluatedSymbolsCombination().toMatrix()).toEqual(Array.from({length: 5}, () => ["A", "A", "A", "A"]));
        expect(new VideoSlotSessionSerializer().getRoundData(ante).reelsSymbols).toEqual(Array.from({length: 5}, () => ["S", "A", "A"]));
        // Once learned, this evaluation contract is available to every preflight caller.
        config.setLinesDefinitions(new CustomLinesDefinitions().setLineDefinition("outside", [4, 4, 4, 4, 4]));
        generator.generateSymbolsCombination.mockClear();
        const settledCredits = ante.getCreditsAmount();
        expect(new SessionRuntime(ante).execute({kind: "spin"})).toMatchObject({status: "blocked", reason: expect.stringContaining("evaluation domain")});
        expect(() => ante.play()).toThrow(/evaluation domain/);
        expect(generator.generateSymbolsCombination).not.toHaveBeenCalled();
        expect(ante.getCreditsAmount()).toBe(settledCredits);
    });

    it("F8 unavailable evaluation bounds still reject newly discovered invalid lines before initial publication", () => {
        const config = overscanConfig();
        config.setScreenGeometry(undefined);
        config.setLinesDefinitions(new CustomLinesDefinitions().setLineDefinition("outside", [4, 4, 4, 4, 4]));
        const generator = {generateSymbolsCombination: jest.fn(() => combination())};
        expect(() => new VideoSlotSession(config, generator)).toThrow(/evaluation domain/);
        expect(generator.generateSymbolsCombination).toHaveBeenCalledTimes(1);
    });

    it.each([[0, 0, 0, 0], [-1, 0, 0, 0, 0], [0.5, 0, 0, 0, 0], [NaN, 0, 0, 0, 0]].map(line => [line] as const))(
        "F8 unresolved bounds retain structural preflight before generation and free/ante mutation (%j)", line => {
            const config = overscanConfig();
            config.setScreenGeometry(undefined);
            const generator = {generateSymbolsCombination: jest.fn(() => new SymbolsCombination().fromMatrix(Array.from({length: 5}, () => ["B", "B", "B"])))};
            const base = new VideoSlotSession(config, generator);
            const free = new VideoSlotWithFreeGamesSession(new VideoSlotWithFreeGamesConfig(config, {}), undefined, undefined, base);
            free.setFreeGamesSum(2);
            const ante = new VideoSlotWithBetModesSession(free, new BetModesConfig([
                new BetModeDefinition("base"), new BetModeDefinition("ante", {stakeMultiplier: 2}),
            ]));
            ante.setBetMode("ante");
            const credits = ante.getCreditsAmount(),
                state = free.toSessionState();
            config.setLinesDefinitions(new CustomLinesDefinitions().setLineDefinition("invalid", line));
            generator.generateSymbolsCombination.mockClear();
            expect(() => new VideoSlotSession(config, generator)).toThrow(/evaluation domain/);
            expect(new SessionRuntime(ante).execute({kind: "spin"})).toMatchObject({status: "blocked", reason: expect.stringContaining("evaluation domain")});
            expect(() => ante.play()).toThrow(/evaluation domain/);
            expect(generator.generateSymbolsCombination).not.toHaveBeenCalled();
            expect(ante.getCreditsAmount()).toBe(credits);
            expect(free.toSessionState()).toEqual(state);
        },
    );

    it("F8 ordinary empty metadata initialization supplies no bounds but cannot settle authored paylines", () => {
        const config = overscanConfig();
        config.setScreenGeometry(undefined);
        const generator = {generateSymbolsCombination: () => new SymbolsCombination().fromMatrix([])};
        const session = new VideoSlotSession(config, generator);
        const credits = session.getCreditsAmount();
        expect(() => session.play()).toThrow(/evaluation domain/);
        expect(session.getCreditsAmount()).toBe(credits);
        expect(session.getWinAmount()).toBe(0);
    });

    it("F3 validates the evaluated 20-cell cluster window rather than the 15-cell viewport", () => {
        const config = overscanConfig();
        const geometry = {...overscanGeometry, evaluated: {rowOffset: 2, rows: 4}};
        config.setScreenGeometry(geometry);
        config.getPaytable().setPayoutForSymbol("B", 20, 99);
        const generated = new SymbolsCombination().fromMatrix(Array.from({length: 5}, () => ["S", "S", "B", "B", "B", "B", "S"])).withCoordinates(geometry);
        const calculator = new ClusterWinCalculator(config, 16);
        expect(Object.values(calculator.calculateWinningClusters(1, generated)).map(win => win.getWinAmount())).toEqual([99]);
        const pipeline = new WinEvaluationPipeline([new ClusterWinEvaluator(calculator, 16)]);
        expect(pipeline.evaluate(new WinEvaluationContext(1, generated, config)).getTotalWin()).toBe(99);
        config.setScreenGeometry(overscanGeometry);
        expect(() => pipeline.evaluate(new WinEvaluationContext(1, combination(), config))).toThrow(/only 15/);
    });

    it.each(["jackpot", "holdAndWin", "stacked"] as const)("F8 rejects upcoming overscan without changing RNG, credits or settled feature ownership (%s)", feature => {
        const config = overscanConfig();
        config.setScreenGeometry(undefined);
        const rng = {getRandomInt: jest.fn(() => 2)};
        const base = new VideoSlotSession(config, new SymbolsCombinationsGenerator(config, rng));
        const pool = new AccumulatingJackpotPool("test", 20);
        const hold = new VideoSlotWithHoldAndWinSession(base);
        const jackpot = new VideoSlotWithJackpotSession(feature === "stacked" ? hold : base, [pool], new PercentageOfBetJackpotContributor(0.1), new SymbolCountJackpotTrigger("B", 3));
        const session = feature === "holdAndWin" ? hold : jackpot;
        session.play();
        expect(session.getWinAmount()).toBeGreaterThan(0);
        if (feature !== "jackpot") {
            hold.setHoldAndWinActive(true);
            hold.setHoldAndWinRespinsRemaining(2);
            hold.setLockedHoldAndWinSymbols([{position: [0, 0], symbolId: "A", effect: {kind: "value", amount: 10}}]);
        }
        const snapshot = {
            credits: session.getCreditsAmount(), win: session.getWinAmount(),
            result: session.getWinEvaluationResult(), lines: session.getWinningLines(),
            feature: session.toSessionState(), pool: pool.toSessionState(),
            screen: session.getSymbolsCombination().toMatrix(),
        };
        rng.getRandomInt.mockClear();
        config.setScreenGeometry(overscanGeometry);
        expect(session.getScreenGeometry()).toBeUndefined();
        expect(session.getConfiguredScreenGeometry()).toEqual(overscanGeometry);
        expect(() => session.play()).toThrow(/does not support overscan/);
        expect(rng.getRandomInt).not.toHaveBeenCalled();
        expect(session.getCreditsAmount()).toBe(snapshot.credits);
        expect(session.getWinAmount()).toBe(snapshot.win);
        expect(session.getWinEvaluationResult()).toEqual(snapshot.result);
        expect(session.getWinningLines()).toEqual(snapshot.lines);
        expect(session.toSessionState()).toEqual(snapshot.feature);
        expect(pool.toSessionState()).toEqual(snapshot.pool);
        expect(session.getSymbolsCombination().toMatrix()).toEqual(snapshot.screen);
        expect(session.getScreenGeometry()).toBeUndefined();
    });

    it.each(["jackpot", "holdAndWin"] as const)("F8 forwards unsupported upcoming geometry preflight through supported ante composition (%s)", feature => {
        const config = overscanConfig();
        config.setScreenGeometry(undefined);
        const rng = {getRandomInt: jest.fn(() => 2)};
        const base = new VideoSlotSession(config, new SymbolsCombinationsGenerator(config, rng));
        const decorated = feature === "holdAndWin" ? new VideoSlotWithHoldAndWinSession(base) : base;
        const modes = new VideoSlotWithBetModesSession(decorated, new BetModesConfig([new BetModeDefinition("base"), new BetModeDefinition("ante", {stakeMultiplier: 2})]));
        const session = feature === "jackpot" ? new VideoSlotWithJackpotSession(modes) : modes;
        modes.setBetMode("ante");
        session.play();
        const credits = session.getCreditsAmount();
        const settledWin = session.getWinAmount();
        const featureState = session.toSessionState();
        config.setScreenGeometry(overscanGeometry);
        rng.getRandomInt.mockClear();
        expect(() => session.play()).toThrow(/does not support overscan/);
        expect(rng.getRandomInt).not.toHaveBeenCalled();
        expect(session.getCreditsAmount()).toBe(credits);
        expect(session.getWinAmount()).toBe(settledWin);
        expect(session.toSessionState()).toEqual(featureState);
    });

    it.each(["jackpot", "holdAndWin", "jackpotOutsideHold", "holdOutsideJackpot"] as const)("F8 preflights tagged generator geometry through feature stacks and ante (%s)", feature => {
        for (const ante of [false, true]) {
            const config = overscanConfig();
            config.setScreenGeometry(undefined);
            const generator = {generateSymbolsCombination: jest.fn(() => combination())};
            const base = new VideoSlotSession(config, generator);
            base.play();
            expect(base.getWinAmount()).toBe(3);
            const pool = new AccumulatingJackpotPool("tagged", 20);
            const jackpot = (session: VideoSlotSessionHandling) => new VideoSlotWithJackpotSession(session, [pool], new PercentageOfBetJackpotContributor(0.1), new SymbolCountJackpotTrigger("B", 3));
            const hold = new VideoSlotWithHoldAndWinSession(feature === "holdOutsideJackpot" ? jackpot(base) : base);
            hold.setHoldAndWinActive(true);
            hold.setHoldAndWinRespinsRemaining(2);
            hold.setLockedHoldAndWinSymbols([{position: [0, 0], symbolId: "A", effect: {kind: "value", amount: 10}}]);
            const decorated = feature === "holdAndWin" || feature === "holdOutsideJackpot" ? hold :
                jackpot(feature === "jackpotOutsideHold" ? hold : base);
            const session = new VideoSlotWithBetModesSession(decorated, new BetModesConfig([new BetModeDefinition("base"), new BetModeDefinition("ante", {stakeMultiplier: 2})]));
            if (ante) session.setBetMode("ante");
            const snapshot = {
                credits: session.getCreditsAmount(), win: session.getWinAmount(), lines: session.getWinningLines(),
                result: session.getWinEvaluationResult(), state: session.toSessionState(),
                pool: pool.toSessionState(), geometry: session.getScreenGeometry(), screen: session.getSymbolsCombination().toMatrix(),
            };
            generator.generateSymbolsCombination.mockClear();
            expect(config.getScreenGeometry()).toBeUndefined();
            expect(session.getConfiguredScreenGeometry()).toEqual(overscanGeometry);
            expect(() => session.play()).toThrow(/does not support overscan/);
            expect(generator.generateSymbolsCombination).not.toHaveBeenCalled();
            expect(session.getCreditsAmount()).toBe(snapshot.credits);
            expect(session.getWinAmount()).toBe(snapshot.win);
            expect(session.getWinningLines()).toEqual(snapshot.lines);
            expect(session.getWinEvaluationResult()).toEqual(snapshot.result);
            expect(session.toSessionState()).toEqual(snapshot.state);
            expect(pool.toSessionState()).toEqual(snapshot.pool);
            expect(session.getScreenGeometry()).toEqual(snapshot.geometry);
            expect(session.getSymbolsCombination().toMatrix()).toEqual(snapshot.screen);
        }
    });

    it.each(["jackpot", "holdAndWin"] as const)("F8 keeps settled geometry separate when an untagged generator's upcoming model becomes ordinary (%s)", feature => {
        const config = overscanConfig();
        let screen = adversarialScreen();
        const base = new VideoSlotSession(config, {generateSymbolsCombination: () => new SymbolsCombination().fromMatrix(screen)});
        base.play();
        const decorated = feature === "holdAndWin" ? new VideoSlotWithHoldAndWinSession(base) : base;
        const modes = new VideoSlotWithBetModesSession(decorated);
        const session = feature === "jackpot" ? new VideoSlotWithJackpotSession(modes) : modes;
        config.setScreenGeometry(undefined);
        screen = Array.from({length: 5}, () => ["B", "B", "B"]);
        expect(session.getScreenGeometry()).toEqual(overscanGeometry);
        expect(session.getConfiguredScreenGeometry()).toBeUndefined();
        expect(() => session.play()).not.toThrow();
        expect(session.getScreenGeometry()).toBeUndefined();
        expect(session.getSymbolsCombination().toMatrix()).toEqual(screen);
        expect(session.getWinAmount()).toBe(3);
    });

    it.each(["direct", "jackpot", "holdAndWin", "jackpotOutsideHold", "holdOutsideJackpot"] as const)("F8 rejects a configured identity conflicting with a known generator contract before mutation (%s)", feature => {
        for (const ante of [false, true]) {
            const config = overscanConfig();
            config.setScreenGeometry(undefined);
            const generator = {generateSymbolsCombination: jest.fn(() => combination())};
            const base = new VideoSlotSession(config, generator);
            base.play();
            const pool = new AccumulatingJackpotPool("conflict", 20);
            const jackpot = (session: VideoSlotSessionHandling) => new VideoSlotWithJackpotSession(session, [pool], new PercentageOfBetJackpotContributor(0.1), new SymbolCountJackpotTrigger("B", 3));
            const hold = new VideoSlotWithHoldAndWinSession(feature === "holdOutsideJackpot" ? jackpot(base) : base);
            hold.setHoldAndWinActive(true);
            hold.setHoldAndWinRespinsRemaining(2);
            hold.setLockedHoldAndWinSymbols([{position: [0, 0], symbolId: "A", effect: {kind: "value", amount: 10}}]);
            const withFeature = feature === "holdAndWin" || feature === "holdOutsideJackpot" ? hold :
                jackpot(feature === "jackpotOutsideHold" ? hold : base);
            const decorated = feature === "direct" ? base : withFeature;
            const session = ante ? new VideoSlotWithBetModesSession(decorated, new BetModesConfig([new BetModeDefinition("base"), new BetModeDefinition("ante", {stakeMultiplier: 2})])) : decorated;
            if (session instanceof VideoSlotWithBetModesSession) session.setBetMode("ante");
            const snapshot = {credits: session.getCreditsAmount(), hold: hold.toSessionState(), pool: pool.toSessionState(), screen: session.getSymbolsCombination().toMatrix()};
            config.setScreenGeometry({generated: {reels: 5, rows: 3}, visible: {rowOffset: 0, rows: 3}, evaluated: {rowOffset: 0, rows: 3}, paylineSpace: "evaluated"});
            generator.generateSymbolsCombination.mockClear();
            expect(() => session.play()).toThrow(/geometry.*differs|coordinate contract/i);
            expect(generator.generateSymbolsCombination).not.toHaveBeenCalled();
            expect(session.getCreditsAmount()).toBe(snapshot.credits);
            expect(hold.toSessionState()).toEqual(snapshot.hold);
            expect(pool.toSessionState()).toEqual(snapshot.pool);
            expect(session.getSymbolsCombination().toMatrix()).toEqual(snapshot.screen);
            expect(session.getScreenGeometry?.()).toEqual(overscanGeometry);
            // Direct rejected rounds invalidate their result; outer preflight preserves settlement.
            expect(session.getWinAmount()).toBe(feature === "direct" && !ante ? 0 : 3);
        }
    });

    it.each(["direct", "jackpot", "holdAndWin", "jackpotOutsideHold", "holdOutsideJackpot"] as const)("F8 ordinary upcoming geometry accepts supported stacks and rejects reversed decorators (%s)", feature => {
        for (const ante of [false, true]) {
            const config = overscanConfig();
            const rng = {getRandomInt: jest.fn(() => 2)};
            const base = new VideoSlotSession(config, new SymbolsCombinationsGenerator(config, rng));
            base.play();
            const jackpot = (session: VideoSlotSessionHandling) => new VideoSlotWithJackpotSession(session);
            const hold = new VideoSlotWithHoldAndWinSession(feature === "holdOutsideJackpot" ? jackpot(base) : base);
            const withFeature = feature === "holdAndWin" || feature === "holdOutsideJackpot" ? hold :
                jackpot(feature === "jackpotOutsideHold" ? hold : base);
            const decorated = feature === "direct" ? base : withFeature;
            const session = ante ? new VideoSlotWithBetModesSession(decorated, new BetModesConfig([new BetModeDefinition("base"), new BetModeDefinition("ante", {stakeMultiplier: 2})])) : decorated;
            if (session instanceof VideoSlotWithBetModesSession) session.setBetMode("ante");
            const screen = session.getSymbolsCombination().toMatrix();
            const credits = session.getCreditsAmount();
            const settledWin = session.getWinAmount();
            config.setScreenGeometry(undefined);
            rng.getRandomInt.mockClear();
            expect(session.getConfiguredScreenGeometry?.()).toBeUndefined();
            if (feature === "holdOutsideJackpot" || (ante && ["jackpot", "jackpotOutsideHold"].includes(feature))) {
                const state = session.toSessionState();
                const rejected = session as VideoSlotWithHoldAndWinSession | VideoSlotWithBetModesSession;
                expect(rejected.isSessionStateRestorable()).toBe(false);
                const error = feature === "holdOutsideJackpot" ? /inside bet modes and jackpot/ : /Bet modes must be inside jackpot/;
                expect(() => session.validateScreenCoordinates?.()).toThrow(error);
                expect(() => session.play()).toThrow(error);
                expect(() => rejected.validateSessionState(rejected.toSessionState())).toThrow(/inside bet modes and jackpot|Bet modes must be inside jackpot/);
                if (feature === "holdOutsideJackpot") expect(() => hold.fromSessionState(hold.toSessionState())).toThrow(error);
                else expect(() => (session as VideoSlotWithBetModesSession).fromSessionState((session as VideoSlotWithBetModesSession).toSessionState())).toThrow(error);
                expect(rng.getRandomInt).not.toHaveBeenCalled();
                expect(session.toSessionState()).toEqual(state);
                expect(session.getCreditsAmount()).toBe(credits);
                expect(session.getScreenGeometry?.()).toEqual(overscanGeometry);
                expect(session.getSymbolsCombination().toMatrix()).toEqual(screen);
                expect(session.getWinAmount()).toBe(settledWin);
                continue;
            }
            expect(() => session.validateScreenCoordinates?.()).not.toThrow();
            expect(session.getScreenGeometry?.()).toEqual(overscanGeometry);
            expect(session.getSymbolsCombination().toMatrix()).toEqual(screen);
            expect(new VideoSlotSessionSerializer().getRoundData(session).reelsSymbols).toHaveLength(5);
            expect(() => session.play()).not.toThrow();
            expect(rng.getRandomInt).toHaveBeenCalledTimes(5);
            expect(session.getScreenGeometry?.()).toBeUndefined();
            expect(session.getSymbolsCombination().toMatrix()).toEqual(Array.from({length: 5}, () => ["B", "B", "B"]));
            expect(session.getWinAmount()).toBe(3);
            expect(session.getCreditsAmount()).toBe(credits + 3 - (ante ? 2 : 1));
        }
    });

    it.each([false, true])("F8 capability-only untagged generation pays and presents the declared windows (ante %s)", ante => {
        const config = overscanConfig();
        config.setScreenGeometry(undefined);
        const screen = Array.from({length: 5}, () => ["S", "A", "B", "B", "B", "A", "S"]);
        const generator = {getScreenGeometry: jest.fn(() => overscanGeometry),
            generateSymbolsCombination: jest.fn(() => new SymbolsCombination().fromMatrix(screen))};
        const base = new VideoSlotSession(config, generator);
        const session = ante ? new VideoSlotWithBetModesSession(base, new BetModesConfig([
            new BetModeDefinition("base"), new BetModeDefinition("ante", {stakeMultiplier: 2}),
        ])) : base;
        if (session instanceof VideoSlotWithBetModesSession) session.setBetMode("ante");
        const credits = session.getCreditsAmount();
        generator.getScreenGeometry.mockClear();
        session.play();
        if (!ante) expect(generator.getScreenGeometry).toHaveBeenCalledTimes(1);
        expect(session.getWinAmount()).toBe(3);
        expect(session.getCreditsAmount()).toBe(credits + 3 - (ante ? 2 : 1));
        expect(session.getScreenGeometry?.()).toEqual(overscanGeometry);
        expect(base.getSymbolsCombination().getScreenGeometry?.()).toBeUndefined();
        expect(session.getEvaluatedSymbolsCombination?.().toMatrix()).toEqual(Array.from({length: 5}, () => ["B", "B", "B"]));
        expect(new VideoSlotSessionSerializer().getInitialData(session)).toMatchObject({
            reelsNumber: 5, reelsSymbolsNumber: 3, reelsSymbols: Array.from({length: 5}, () => ["A", "B", "B"]), totalWin: 3,
        });
        const artifact = buildRoundArtifactFromSession(session, {roundId: "capability", provenance, stake: 1});
        expect(artifact.generatedScreen).toEqual(screen);
        expect(artifact.geometry).toEqual(overscanGeometry);
    });

    it("F8 capability-only base evaluation drives authored free-game grants", () => {
        const config = overscanConfig();
        config.setScreenGeometry(undefined);
        const screen = adversarialScreen();
        screen[0][2] = "S";
        const base = new VideoSlotSession(config, {getScreenGeometry: () => overscanGeometry,
            generateSymbolsCombination: () => new SymbolsCombination().fromMatrix(screen)});
        const grants = new VideoSlotWithFreeGamesConfig(overscanConfig(), {});
        grants.setFreeGamesForScatters("S", 1, 2);
        grants.setFreeGamesForScatters("S", 11, 99);
        const free = new VideoSlotWithFreeGamesSession(grants, undefined, undefined, base);
        free.play();
        expect(free.getWonFreeGamesNumber()).toBe(2);
        expect(free.getFreeGamesSum()).toBe(2);
    });

    it("F8 empty enumeration initialization cannot be exposed or settled as an overscan result", () => {
        const config = overscanConfig();
        const session = new VideoSlotSession(config, {generateSymbolsCombination: () => new SymbolsCombination().fromMatrix([])});
        const credits = session.getCreditsAmount();
        expect(() => new VideoSlotSessionSerializer().getRoundData(session)).toThrow(/generated dimensions/);
        expect(() => session.play()).toThrow(/generated dimensions/);
        expect(session.getCreditsAmount()).toBe(credits);
        expect(session.getWinAmount()).toBe(0);
    });

    it.each(["ordinary", "differentWindow", "visible", "evaluated", "untaggedVisible"] as const)("F8 reconciles every newly returned tag and space with its generation contract (%s)", conflict => {
        const config = overscanConfig();
        config.setScreenGeometry(undefined);
        const geometry = conflict === "ordinary" ? undefined : overscanGeometry;
        const tagged = conflict === "differentWindow"
            ? new SymbolsCombination().fromMatrix(adversarialScreen()).withCoordinates({...overscanGeometry, evaluated: {rowOffset: 1, rows: 3}})
            : combination();
        let returned = tagged;
        if (conflict === "visible" || conflict === "evaluated") {
            returned = new SymbolsCombination().fromMatrix(new ScreenProjection(overscanGeometry).project(adversarialScreen(), conflict)).withCoordinates(overscanGeometry, conflict);
        } else if (conflict === "untaggedVisible") {
            returned = new Proxy(tagged, {get(target, property) {
                if (property === "getCoordinateSpace") return () => "visible";
                if (property === "getScreenGeometry") return () => undefined;
                const value = Reflect.get(target, property);
                return typeof value === "function" ? value.bind(target) : value;
            }});
        }
        const generator = {getScreenGeometry: () => geometry, generateSymbolsCombination: jest.fn(() => returned)};
        expect(() => new VideoSlotSession(config, generator)).toThrow(/coordinate contract|generated coordinate space/);
        expect(generator.generateSymbolsCombination).toHaveBeenCalledTimes(1);
        // A newly contradictory result must also reject on replacement, without settling it.
        const valid = geometry ? new SymbolsCombination().fromMatrix(adversarialScreen()) : new SymbolsCombination().fromMatrix(Array.from({length: 5}, () => ["B", "B", "B"]));
        generator.generateSymbolsCombination.mockReturnValue(valid);
        const session = new VideoSlotSession(config, generator);
        session.play();
        const credits = session.getCreditsAmount(), 
            screen = session.getSymbolsCombination().toMatrix();
        generator.generateSymbolsCombination.mockReturnValue(returned);
        expect(() => session.play()).toThrow(/coordinate contract|generated coordinate space/);
        expect(session.getCreditsAmount()).toBe(credits);
        expect(session.getSymbolsCombination().toMatrix()).toEqual(screen);
        expect(session.getWinAmount()).toBe(0);
    });

    it.each(["jackpot", "holdAndWin"] as const)("F8 capability-only overscan reaches feature preflight through outer ante (%s)", feature => {
        const config = overscanConfig();
        config.setScreenGeometry(undefined);
        const generator = {getScreenGeometry: () => overscanGeometry, generateSymbolsCombination: jest.fn(() => new SymbolsCombination().fromMatrix(adversarialScreen()))};
        const base = new VideoSlotSession(config, generator);
        const decorated = feature === "jackpot" ? new VideoSlotWithJackpotSession(base) : new VideoSlotWithHoldAndWinSession(base);
        const session = new VideoSlotWithBetModesSession(decorated, new BetModesConfig([
            new BetModeDefinition("base"), new BetModeDefinition("ante", {stakeMultiplier: 2}),
        ]));
        session.setBetMode("ante");
        const state = session.toSessionState(), 
            credits = session.getCreditsAmount();
        generator.generateSymbolsCombination.mockClear();
        expect(() => session.play()).toThrow(/does not support overscan/);
        expect(generator.generateSymbolsCombination).not.toHaveBeenCalled();
        expect(session.getCreditsAmount()).toBe(credits);
        expect(session.toSessionState()).toEqual(state);
    });

    it.each([false, true])("F8 generator-only evaluation bounds preflight every known payline before direct, ante and free mutation (capability %s)", capability => {
        for (const defaults of [false, true]) {
            const config = overscanConfig();
            config.setScreenGeometry(undefined);
            const generator = {generateSymbolsCombination: jest.fn(() => capability ? new SymbolsCombination().fromMatrix(adversarialScreen()) : combination()),
                ...(capability ? {getScreenGeometry: () => overscanGeometry} : {})};
            const base = new VideoSlotSession(config, generator);
            base.play();
            const freeConfig = new VideoSlotWithFreeGamesConfig(overscanConfig(), {});
            const free = new VideoSlotWithFreeGamesSession(freeConfig, undefined, undefined, base);
            free.setFreeGamesSum(2);
            const freeState = free.toSessionState();
            const short = {...overscanGeometry, evaluated: {rowOffset: 2, rows: 2}};
            // The new generator declaration (or legacy settled tag) is known before another draw.
            if (capability) generator.getScreenGeometry = () => short;
            else (base.getSymbolsCombination() as SymbolsCombination).withCoordinates(short);
            if (defaults) config.setLinesDefinitions(new HorizontalLines(5, 3));
            const credits = base.getCreditsAmount();
            generator.generateSymbolsCombination.mockClear();
            expect(() => base.validateScreenCoordinates()).toThrow(/Payline "2"/);
            const ante = new VideoSlotWithBetModesSession(base, new BetModesConfig([
                new BetModeDefinition("base"), new BetModeDefinition("ante", {stakeMultiplier: 2}),
            ]));
            ante.setBetMode("ante");
            expect(() => ante.play()).toThrow(/Payline "2"/);
            expect(new SessionRuntime(ante).execute({kind: "spin"})).toMatchObject({status: "blocked", reason: expect.stringContaining('Payline "2"')});
            freeConfig.setScreenGeometry(short);
            expect(() => free.play()).toThrow(/Payline "2"/);
            expect(free.toSessionState()).toEqual(freeState);
            expect(() => base.play()).toThrow(/Payline "2"/);
            expect(generator.generateSymbolsCombination).not.toHaveBeenCalled();
            expect(base.getCreditsAmount()).toBe(credits);
            expect(base.getWinAmount()).toBe(0);
        }
    });

    it.each([false, true])("F8 settled viewport and dimensions survive upcoming edits and rejected replacement (decorator %s)", decorated => {
        const config = overscanConfig();
        const generator = new SymbolsCombinationsGenerator(config, {getRandomInt: () => 0});
        const base = new VideoSlotSession(config, generator);
        const session = decorated ? new VideoSlotWithBetModesSession(base) : base;
        session.play();
        const serializer = new VideoSlotSessionSerializer();
        const initial = serializer.getInitialData(session), 
            evaluated = session.getEvaluatedSymbolsCombination?.().toMatrix();
        const next = {...overscanGeometry, visible: {rowOffset: 1, rows: 4}, evaluated: {rowOffset: 2, rows: 4}};
        config.setReelsSymbolsNumber(4);
        config.setScreenGeometry(next);
        expect(() => session.validateScreenCoordinates?.()).not.toThrow();
        expect(serializer.getInitialData(session)).toEqual(initial);
        expect(session.getEvaluatedSymbolsCombination?.().toMatrix()).toEqual(evaluated);
        expect(captureInitialPokieSessionState(undefined, session, serializer, false).screen).toEqual(initial.reelsSymbols);
        const generate = jest.spyOn(generator, "generateSymbolsCombination").mockImplementationOnce(() => combination());
        expect(() => session.play()).toThrow(/coordinate contract/);
        expect(serializer.getInitialData(session)).toMatchObject({reelsNumber: 5, reelsSymbolsNumber: 3, reelsSymbols: initial.reelsSymbols});
        expect(session.getScreenGeometry?.()).toEqual(overscanGeometry);
        session.play();
        expect(serializer.getInitialData(session)).toMatchObject({reelsNumber: 5, reelsSymbolsNumber: 4});
        expect(serializer.getRoundData(session).reelsSymbols[0]).toHaveLength(4);
        expect(session.getScreenGeometry?.()).toEqual(next);
        generate.mockRestore();
    });

    it("F8 ordinary settled dimensions remain unchanged until a declared replacement settles", () => {
        const config = overscanConfig();
        config.setScreenGeometry(undefined);
        const base = new VideoSlotSession(config, new SymbolsCombinationsGenerator(config, {getRandomInt: () => 2}));
        const session = new VideoSlotWithBetModesSession(base);
        session.play();
        const serializer = new VideoSlotSessionSerializer(), 
            initial = serializer.getInitialData(session);
        config.setReelsSymbolsNumber(4);
        config.setScreenGeometry({...overscanGeometry, visible: {rowOffset: 1, rows: 4}, evaluated: {rowOffset: 2, rows: 4}});
        session.validateScreenCoordinates();
        expect(serializer.getInitialData(session)).toMatchObject({reelsNumber: 5, reelsSymbolsNumber: 3, reelsSymbols: initial.reelsSymbols});
        session.play();
        expect(serializer.getInitialData(session)).toMatchObject({reelsNumber: 5, reelsSymbolsNumber: 4});
    });

    it.each([false, true])("F8 shared built-in free-games contracts accept upcoming geometry changes (ante %s)", ante => {
        const config = new VideoSlotWithFreeGamesConfig(overscanConfig(), {});
        config.setScreenGeometry(undefined);
        const rng = {getRandomInt: jest.fn(() => 2)};
        const free = new VideoSlotWithFreeGamesSession(config, new SymbolsCombinationsGenerator(config, rng));
        const session = new VideoSlotWithBetModesSession(free, new BetModesConfig([new BetModeDefinition("base"), new BetModeDefinition("ante", {stakeMultiplier: 2})]));
        if (ante) session.setBetMode("ante");
        session.play();
        for (const geometry of [overscanGeometry, {...overscanGeometry, evaluated: {rowOffset: 0, rows: 3}}, undefined]) {
            const settledGeometry = session.getScreenGeometry();
            const credits = session.getCreditsAmount();
            config.setScreenGeometry(geometry);
            rng.getRandomInt.mockClear();
            expect(() => session.validateScreenCoordinates()).not.toThrow();
            expect(session.getScreenGeometry()).toEqual(settledGeometry);
            expect(() => session.play()).not.toThrow();
            expect(rng.getRandomInt).toHaveBeenCalledTimes(5);
            expect(session.getScreenGeometry()).toEqual(geometry);
            expect(session.getCreditsAmount()).toBe(credits + session.getWinAmount() - (ante ? 2 : 1));
            expect(session.getSymbolsCombination().toMatrix()[0]).toHaveLength(geometry ? 7 : 3);
            expect(new VideoSlotSessionSerializer().getRoundData(session).reelsSymbols[0]).toHaveLength(3);
        }
    });

    it.each(["wrapperOverscan", "baseOverscan", "differentOverscan"] as const)("F8 free-games mismatched upcoming contracts reject before free-round and ante mutation (%s)", mismatch => {
        const baseConfig = overscanConfig();
        baseConfig.setScreenGeometry(undefined);
        const config = new VideoSlotWithFreeGamesConfig(overscanConfig(), {});
        config.setScreenGeometry(undefined);
        const rng = {getRandomInt: jest.fn(() => 2)};
        const base = new VideoSlotSession(baseConfig, new SymbolsCombinationsGenerator(baseConfig, rng));
        const free = new VideoSlotWithFreeGamesSession(config, undefined, undefined, base);
        const session = new VideoSlotWithBetModesSession(free, new BetModesConfig([new BetModeDefinition("base"), new BetModeDefinition("ante", {stakeMultiplier: 2})]));
        session.setBetMode("ante");
        session.play();
        free.setFreeGamesSum(3);
        if (mismatch !== "baseOverscan") config.setScreenGeometry(overscanGeometry);
        if (mismatch !== "wrapperOverscan") baseConfig.setScreenGeometry({...overscanGeometry, evaluated: {rowOffset: 1, rows: 3}});
        const snapshot = {credits: session.getCreditsAmount(), state: session.toSessionState(), win: session.getWinAmount(), screen: session.getSymbolsCombination().toMatrix()};
        rng.getRandomInt.mockClear();
        expect(() => session.play()).toThrow(/same.*coordinate contract/);
        expect(rng.getRandomInt).not.toHaveBeenCalled();
        expect(session.getCreditsAmount()).toBe(snapshot.credits);
        expect(session.toSessionState()).toEqual(snapshot.state);
        expect(session.getWinAmount()).toBe(snapshot.win);
        expect(session.getSymbolsCombination().toMatrix()).toEqual(snapshot.screen);
    });

    it.each(["jackpot", "holdAndWin", "jackpotOutsideHold", "holdOutsideJackpot"] as const)("F8 shared free-games and ante preflight preserve geometry and composition boundaries (%s)", feature => {
        const config = new VideoSlotWithFreeGamesConfig(overscanConfig(), {});
        config.setScreenGeometry(undefined);
        const rng = {getRandomInt: jest.fn(() => 2)};
        const free = new VideoSlotWithFreeGamesSession(config, new SymbolsCombinationsGenerator(config, rng));
        // Settle the ordinary screen through its supported engine before testing stack preflight.
        free.play();
        const jackpot = (session: VideoSlotSessionHandling) => new VideoSlotWithJackpotSession(session);
        const hold = new VideoSlotWithHoldAndWinSession(feature === "holdOutsideJackpot" ? jackpot(free) : free);
        const decorated = feature === "holdAndWin" || feature === "holdOutsideJackpot" ? hold : jackpot(feature === "jackpotOutsideHold" ? hold : free);
        const modes = new VideoSlotWithBetModesSession(feature === "jackpot" ? free : decorated, new BetModesConfig([new BetModeDefinition("base"), new BetModeDefinition("ante", {stakeMultiplier: 2})]));
        const session = feature === "jackpot" ? jackpot(modes) : modes;
        modes.setBetMode("ante");
        if (feature === "jackpot") session.play();
        free.setFreeGamesSum(3);
        const snapshot = {credits: session.getCreditsAmount(), state: session.toSessionState(), win: session.getWinAmount(), screen: session.getSymbolsCombination().toMatrix()};
        config.setScreenGeometry(overscanGeometry);
        rng.getRandomInt.mockClear();
        expect(() => session.play()).toThrow(feature === "jackpot" || feature === "holdOutsideJackpot" ? /does not support overscan/ : /cannot compete with free games/);
        expect(rng.getRandomInt).not.toHaveBeenCalled();
        expect(session.getCreditsAmount()).toBe(snapshot.credits);
        expect(session.toSessionState()).toEqual(snapshot.state);
        expect(session.getWinAmount()).toBe(snapshot.win);
        expect(session.getSymbolsCombination().toMatrix()).toEqual(snapshot.screen);
        config.setScreenGeometry(undefined);
        if (feature === "jackpot") {
            expect(() => session.play()).not.toThrow();
            expect(rng.getRandomInt).toHaveBeenCalledTimes(5);
            expect(free.getFreeGamesNum()).toBe(1);
        } else {
            // Removing overscan does not make competing progression or reversed jackpot order safe.
            expect(hold.isSessionStateRestorable()).toBe(false);
            expect(() => session.validateScreenCoordinates?.()).toThrow(/cannot compete with free games/);
            expect(() => session.play()).toThrow(/cannot compete with free games/);
            expect(() => hold.validateSessionState(hold.toSessionState())).toThrow(/cannot compete with free games/);
            expect(() => hold.fromSessionState(hold.toSessionState())).toThrow(/cannot compete with free games/);
            expect(rng.getRandomInt).not.toHaveBeenCalled();
            expect(session.getCreditsAmount()).toBe(snapshot.credits);
            expect(session.toSessionState()).toEqual(snapshot.state);
            expect(session.getWinAmount()).toBe(snapshot.win);
            expect(session.getSymbolsCombination().toMatrix()).toEqual(snapshot.screen);
            expect(free.getFreeGamesNum()).toBe(0);
        }
    });

    it("F8 detects a built-in generator's independent upcoming configuration before generation", () => {
        const config = overscanConfig();
        config.setScreenGeometry(undefined);
        const generatorConfig = overscanConfig();
        generatorConfig.setScreenGeometry(undefined);
        const rng = {getRandomInt: jest.fn(() => 2)};
        const generator = new SymbolsCombinationsGenerator(generatorConfig, rng);
        const base = new VideoSlotSession(config, generator);
        base.play();
        const session = new VideoSlotWithBetModesSession(base, new BetModesConfig([new BetModeDefinition("base"), new BetModeDefinition("ante", {stakeMultiplier: 2})]));
        session.setBetMode("ante");
        const credits = session.getCreditsAmount();
        generatorConfig.setScreenGeometry(overscanGeometry);
        config.setScreenGeometry({generated: {reels: 5, rows: 3}, visible: {rowOffset: 0, rows: 3}, evaluated: {rowOffset: 0, rows: 3}, paylineSpace: "evaluated"});
        rng.getRandomInt.mockClear();
        expect(() => session.play()).toThrow(/Generator geometry differs/);
        expect(rng.getRandomInt).not.toHaveBeenCalled();
        expect(session.getCreditsAmount()).toBe(credits);
        expect(session.getScreenGeometry()).toBeUndefined();
        expect(() => new VideoSlotSession(config, generator)).toThrow(/Generator geometry differs/);
        expect(rng.getRandomInt).not.toHaveBeenCalled();
        // The optional capability's undefined return is an ordinary contract, not unknown.
        generatorConfig.setScreenGeometry(undefined);
        config.setScreenGeometry(overscanGeometry);
        expect(() => session.play()).toThrow(/Generator geometry differs/);
        expect(rng.getRandomInt).not.toHaveBeenCalled();
        config.setScreenGeometry(undefined);
        expect(() => session.play()).not.toThrow();
    });

    it.each(["jackpot", "holdAndWin"] as const)("F8 retains tag detection for legacy sessions without upcoming capabilities (%s)", feature => {
        const config = overscanConfig();
        config.setScreenGeometry(undefined);
        const generator = {generateSymbolsCombination: jest.fn(() => combination())};
        const base = new VideoSlotSession(config, generator);
        const legacy: VideoSlotSessionHandling = new Proxy(base, {get(target, property, receiver) {
            if (property === "getConfiguredScreenGeometry" || property === "validateScreenCoordinates") return undefined;
            return Reflect.get(target, property, receiver);
        }});
        const decorated = feature === "jackpot" ? new VideoSlotWithJackpotSession(legacy) : new VideoSlotWithHoldAndWinSession(legacy);
        const session = new VideoSlotWithBetModesSession(decorated);
        generator.generateSymbolsCombination.mockClear();
        expect(() => session.play()).toThrow(/does not support overscan/);
        expect(generator.generateSymbolsCombination).not.toHaveBeenCalled();
        expect(session.getCreditsAmount()).toBe(base.getCreditsAmount());
    });

    it("normalizes the pipeline even with optional validation disabled and custom evaluators", () => {
        const config = overscanConfig();
        const evaluate = jest.fn((context: WinEvaluationContext) => {
            expect(context.getSymbolsCombination().toMatrix()).toEqual(Array.from({length: 5}, () => ["B", "B", "B"]));
            return [];
        });
        const custom: WinEvaluator = {evaluate, getEvaluatorId: () => "custom", getEvaluatorGroup: () => "custom", getComponentType: () => "custom"};
        const pipeline = new WinEvaluationPipeline([custom], undefined, undefined, [], {validateOnEvaluate: false});
        pipeline.evaluate(new WinEvaluationContext(1, combination(), config));
        expect(evaluate).toHaveBeenCalledTimes(1);
        config.setLinesDefinitions(new CustomLinesDefinitions().fromMap({bad: [3, 3, 3, 3, 3]}));
        expect(() => pipeline.evaluate(new WinEvaluationContext(1, combination(), config))).toThrow(/evaluation domain/);
    });

    it.each([[0], [3, 3, 3, 3, 3], [-1, 0, 0, 0, 0], [0.5, 0, 0, 0, 0], [NaN, 0, 0, 0, 0]].map(line => [line] as const))("rejects malformed direct paylines %j", line => {
        const config = overscanConfig();
        config.setLinesDefinitions(new CustomLinesDefinitions().fromMap({bad: line}));
        expect(() => new LineWinCalculator(config).calculateWinningLines(1, combination())).toThrow(/evaluation domain/);
        expect(() => new VideoSlotSession(config)).toThrow(/evaluation domain/);
        expect(new GameBlueprintValidator().validate({...overscanBlueprint, paylines: [line]}).some(issue => issue.code === "blueprint-payline-invalid")).toBe(true);
    });

    it("rejects changed model coordinates before debit and clears the previous round result", () => {
        const config = overscanConfig();
        const session = new VideoSlotSession(config, {generateSymbolsCombination: () => combination()});
        session.play();
        expect(session.getWinAmount()).toBe(3);
        const credits = session.getCreditsAmount();
        config.setReelsNumber(4);
        expect(() => session.play()).toThrow(/geometry/);
        expect(session.getCreditsAmount()).toBe(credits);
        expect(session.getWinAmount()).toBe(0);
        expect(session.getWinningLines()).toEqual({});
    });

    it("binds artifact mappings to the computed round rather than a subsequently edited model", () => {
        const config = overscanConfig();
        const session = new VideoSlotSession(config, {generateSymbolsCombination: () => combination()});
        session.play();
        config.setScreenGeometry({...overscanGeometry, visible: {rowOffset: 2, rows: 3}, evaluated: {rowOffset: 3, rows: 3}});
        const artifact = buildRoundArtifactFromSession(session, {roundId: "frozen-round", provenance});
        expect(artifact.geometry).toEqual(overscanGeometry);
        expect(artifact.screen).toEqual(Array.from({length: 5}, () => ["W", "B", "B"]));
        expect(session.getEvaluatedSymbolsCombination().toMatrix()).toEqual(Array.from({length: 5}, () => ["B", "B", "B"]));
    });

    it.each([undefined, 0])("separates authored free-game grants from missing/zero monetary payouts (%s)", monetary => {
        const config = overscanConfig();
        const paytable = new Paytable<string>(config.getAvailableBets());
        if (monetary !== undefined) paytable.setPayoutForSymbol("S", 3, monetary);
        config.setPaytable(paytable);
        const free = new VideoSlotWithFreeGamesConfig(config, {});
        free.setFreeGamesForScatters("S", 3, 10);
        const matrix = adversarialScreen();
        for (let reel = 0;
            reel < 3;
            reel++) matrix[reel][2] = "S";
        const session = new VideoSlotWithFreeGamesSession(free, {generateSymbolsCombination: () => combination(matrix)});
        session.play();
        expect(session.getWinAmount()).toBe(0);
        expect(session.getWonFreeGamesNumber()).toBe(10);
        expect(session.getFreeGamesSum()).toBe(10);
        expect(session.getScreenGeometry()).toEqual(overscanGeometry);
    });

    it("keeps a decorator's own symbol overlay in ordinary visible and evaluated grids", () => {
        const config = overscanConfig();
        config.setScreenGeometry(undefined);
        const base = new VideoSlotSession(config, {generateSymbolsCombination: () => new SymbolsCombination().fromMatrix(Array.from({length: 5}, () => ["B", "B", "B"]))});
        const decorated = new VideoSlotWithHoldAndWinSession(base);
        decorated.setHoldAndWinActive(true);
        decorated.setLockedHoldAndWinSymbols([{position: [0, 0], symbolId: "A", effect: {kind: "value", amount: 10}}]);
        expect(decorated.getVisibleSymbolsCombination().toMatrix()).toEqual(decorated.getSymbolsCombination().toMatrix());
        expect(decorated.getEvaluatedSymbolsCombination().toMatrix()).toEqual(decorated.getSymbolsCombination().toMatrix());
        expect(new VideoSlotSessionSerializer().getRoundData(decorated).reelsSymbols[0][0]).toBe("A");
    });

    it("presents viewport-local highlights while retaining immutable generated/evaluated artifact evidence", () => {
        const session = fixedSession();
        session.play();
        const serializer = new VideoSlotSessionSerializer();
        expect(session.getVisibleSymbolsCombination().getCoordinateSpace?.()).toBe("visible");
        expect(session.getVisibleSymbolsCombination().getScreenGeometry?.()).toEqual(overscanGeometry);
        expect(() => new WinEvaluationContext(1, session.getVisibleSymbolsCombination(), overscanConfig())).toThrow(/visible screen/);
        const initial = serializer.getInitialData(session);
        expect(initial.reelsSymbols).toEqual(Array.from({length: 5}, () => ["W", "B", "B"]));
        expect(initial.reelsSymbolsNumber).toBe(3);
        expect(initial.linesDefinitions).toEqual({"0": [1, 1, 1, 1, 1], "1": [2, 2, 2, 2, 2]});
        expect(initial.winningPositions).toHaveLength(10);
        expect(initial.totalWin).toBe(3);
        const artifact = buildRoundArtifactFromSession(session, {roundId: "overscan", provenance});
        expect(artifact.generatedScreen).toEqual(adversarialScreen());
        expect(artifact.wins).toHaveLength(3);
        expect(artifact.wins[0].winningPositions[0]).toEqual([0, 0]);
        expect(Object.isFrozen(artifact.generatedScreen![0])).toBe(true);
        expect(new RoundArtifactValidator().validate(JSON.parse(JSON.stringify(artifact)))).toEqual([]);
        const internal = new PokieJsonRoundArtifactProjector().project(artifact);
        expect(internal.generatedScreen).toEqual(adversarialScreen());
        const visible = new PublicRoundArtifactProjector().project(artifact);
        expect(visible).not.toHaveProperty("geometry");
        expect(visible).not.toHaveProperty("generatedScreen");
        expect(visible.steps[0]).not.toHaveProperty("generatedScreen");
        expect(visible.wins[0].winningPositions[0]).toEqual([0, 1]);
        expect(visible.wins[2].winningPositions).toEqual([]);
        const changed = JSON.parse(JSON.stringify(artifact));
        changed.generatedScreen[0][0] = "A";
        changed.steps[0].generatedScreen[0][0] = "A";
        expect(computeRoundArtifactHash(changed)).not.toEqual(internal.hash);
        changed.steps[0].geometry.visible.rowOffset = 0;
        expect(new RoundArtifactValidator().validate(changed).some(issue => issue.code.includes("coordinates"))).toBe(true);
        expect(() => buildRoundArtifact({roundId: "bad", provenance, stake: 1, steps: [{screen: artifact.screen, generatedScreen: artifact.generatedScreen, winEvaluationResult: session.getWinEvaluationResult()}]})).toThrow(/geometry/);
    });

    it("captures required coordinates with debug disabled and rejects corrupted persisted geometry", () => {
        const game = createOverscanGame();
        const session = game.createSession({seed: "7"}) as VideoSlotSessionHandling;
        const initial = captureInitialPokieSessionState({seed: 7}, session, game.getSessionSerializer?.(), false, game);
        expect(initial.coordinates?.generatedScreen[0]).toHaveLength(7);
        session.play();
        const state = captureRoundPokieSessionState({seed: 7}, session, initial, game.getSessionSerializer?.(), {version: 1, mode: "full", captureDebugPayloads: false}, {roundId: "captured", provenance});
        expect(state.coordinates?.generatedScreen[0]).toHaveLength(7);
        expect(state.roundArtifact?.generatedScreen).toEqual(state.coordinates?.generatedScreen);
        expect(validatePersistedSession(state, game)).toBeUndefined();
        const corrupt = JSON.parse(JSON.stringify(state));
        corrupt.coordinates.geometry.evaluated.rowOffset = 5;
        expect(validatePersistedSession(corrupt, game)).toMatchObject({status: "corrupt-state"});
    });

    it("preserves canonical data while pregenerated, Stake and local-adapter presentations use the viewport", () => {
        const session = fixedSession();
        session.play();
        const artifact = buildRoundArtifactFromSession(session, {roundId: "adapters", provenance});
        const library = buildWeightedOutcomeLibrary({libraryId: "overscan-adapters", outcomes: [{id: "one", weight: 1, artifact}]});
        const hash = computeWeightedOutcomeLibraryHash(library);
        const result = buildPreGeneratedRoundResult({expectedLibraryId: library.libraryId, expectedLibraryHash: hash,
            selection: {libraryId: library.libraryId, libraryHash: hash, totalWeight: 1, outcome: library.outcomes[0]},
            runtime: {roundId: "served", sessionId: "s", balanceBefore: 100, balanceAfter: 102, transactions: [{id: "d", type: "debit", amount: 1}, {id: "c", type: "credit", amount: 3}]}});
        const projector = new PreGeneratedRoundResultProjector();
        const publicView = projector.projectPublic(result);
        expect(publicView.screen[0]).toHaveLength(3);
        expect(publicView.wins[0].winningPositions[0]).toEqual([0, 1]);
        expect(publicView).not.toHaveProperty("geometry");
        expect(projector.projectInternal(result).artifact.generatedScreen?.[0]).toHaveLength(7);
        const events = new StakeEngineRoundEventsProjector().project(artifact, {cost: 1});
        expect(events[0]).toMatchObject({type: "reveal", board: artifact.screen});
        expect(events[events.length - 1]).toMatchObject({type: "finalWin", amount: 300});
        const external = new LocalJsonExternalRoundProjector().project(artifact);
        expect(external.screen).toEqual(artifact.screen);
        expect(external).not.toHaveProperty("generatedScreen");
        expect(external).not.toHaveProperty("geometry");
        expect(artifact.generatedScreen).toEqual(adversarialScreen());
    });

    it("F5 projects every step publicly when overscan precedes an ordinary final step", () => {
        const session = fixedSession();
        session.play();
        const screen = new ScreenProjection(overscanGeometry).project(adversarialScreen(), "visible");
        const artifact = buildRoundArtifact({roundId: "mixed", stake: 1, provenance, steps: [
            {screen, geometry: overscanGeometry, generatedScreen: adversarialScreen(), winEvaluationResult: session.getWinEvaluationResult(), debug: {private: "earlier"}},
            {screen, winEvaluationResult: new WinEvaluationResult()},
        ]});
        expect(artifact.geometry).toBeUndefined();
        expect(new RoundArtifactValidator().validate(artifact)).toEqual([]);
        const external = new LocalJsonExternalRoundProjector().project(artifact);
        expect(external).toEqual(new PublicRoundArtifactProjector().project(artifact));
        const json = JSON.stringify(external);
        expect(json).not.toContain("generatedScreen");
        expect(json).not.toContain("geometry");
        expect(json).not.toContain("private");
        expect(external.wins).toEqual(new PublicRoundArtifactProjector().project(artifact).wins);
        expect(artifact.steps[0].generatedScreen).toEqual(adversarialScreen());
    });

    it("preserves Blueprint save/reload, generated runtime and Game Model viewport", () => {
        const blueprint = JSON.parse(serializeGameBlueprint(overscanBlueprint));
        expect(blueprint.screenGeometry).toEqual(overscanGeometry);
        expect(new GameBlueprintValidator().validate(blueprint).filter(issue => issue.severity === "error")).toEqual([]);
        const preview = buildGameModelProjection(blueprint);
        expect(preview.layout).toMatchObject({data: {screenGeometry: overscanGeometry}});
        expect(preview.reels).toMatchObject({data: {gameWindow: {grid: Array.from({length: 5}, () => [
            {symbolId: "W", isWild: true, isScatter: false}, {symbolId: "B", isWild: false, isScatter: false}, {symbolId: "B", isWild: false, isScatter: false},
        ])}}});
        expect(() => resolveCanonicalWasmGameModel(blueprint)).toThrow(/screenGeometry/);
        expect(prepareBlueprintForParSheetExport(blueprint).issues.some(issue => issue.code === "parsheet-screen-geometry-unsupported")).toBe(true);
    });

    it.each([0.05, 7.5, 1e-7])("uses one seeded calculation stream in play, canonical commands, simulation and replay (bet %s)", bet => {
        const game = createOverscanGame({...overscanBlueprint, availableBets: [bet]});
        const direct = game.createSession({seed: "7"}) as VideoSlotSessionHandling;
        const commanded = game.createSession({seed: "7"}) as VideoSlotSessionHandling;
        const simulated = game.createSession({seed: "7"}) as VideoSlotSessionHandling;
        for (const session of [direct, commanded, simulated]) {
            session.setBet(bet);
            session.setCreditsAmount(Number.MAX_SAFE_INTEGER);

        }
        const wins: number[] = [];
        const canonicalWins: number[] = [];
        for (let round = 0; round < 12; round++) {
            direct.play();
            wins.push(direct.getWinAmount());
            const result = new SessionRuntime(commanded).execute({kind: "spin"});
            expect(result.status).toBe("played");
            if (result.status === "played") canonicalWins.push(result.win);
        }
        expect(canonicalWins).toEqual(wins);
        const simulationConfig = new SimulationConfig();
        simulationConfig.setNumberOfRounds(12);
        const simulation = new Simulation(simulated, simulationConfig);
        const sampled: number[] = [];
        simulation.setAfterPlayCallback(() => sampled.push(simulated.getWinAmount()));
        simulation.run();
        expect(sampled).toEqual(wins);
        expect(simulation.getTotalPayoutAmount()).toBeCloseTo(wins.reduce((a, b) => a + b, 0));
        const replay = new ReplayRecorder().record({game, seed: "7", round: 12});
        expect(replay.totalWin).toBe(wins.reduce((a, b) => a + b, 0));
        const sameSeed = game.createSession({seed: "7"}) as VideoSlotSessionHandling;
        sameSeed.setBet(bet);
        sameSeed.setCreditsAmount(Number.MAX_SAFE_INTEGER);
        let replayTotal = 0;
        for (let round = 0; round < 12; round++) {
            sameSeed.play();
            replayTotal += sameSeed.getWinAmount();

        }
        expect(replay.totalWin).toBe(replayTotal);
        expect(replay.screen).toEqual(sameSeed.getVisibleSymbolsCombination!().toMatrix());
        expect(replay.artifact?.generatedScreen).toEqual(sameSeed.getSymbolsCombination().toMatrix());
    });

    it("keeps coordinate evidence and payout across wallet retries and cold restoration", async () => {
        const game = createOverscanGame();
        const session = game.createSession({seed: "7"});
        const repository = new InMemorySessionRepository(),
            wallet = new InMemoryWallet(),
            idempotency = new InMemoryIdempotencyRepository<SpinCommandResult>(),
            operations = new InMemorySpinOperationLog();
        const initial = captureInitialPokieSessionState({seed: "7"}, session, game.getSessionSerializer?.(), false, game);
        await repository.save("s", initial);
        await wallet.setBalance("s", initial.credits!);
        const handler = new SpinCommandHandler(game, repository, wallet, idempotency, operations, true);
        const result = await handler.execute({kind: "spin", sessionId: "s", requestId: "one"});
        expect(result.status).toBe("played");
        if (result.status !== "played") throw new Error(JSON.stringify(result));
        expect(result.state.coordinates?.generatedScreen[0]).toHaveLength(7);
        expect(result.state.screen?.[0]).toHaveLength(3);
        expect(await handler.execute({kind: "spin", sessionId: "s", requestId: "one"})).toEqual(result);
        const balance = await wallet.getBalance("s");
        const cold = new SpinCommandHandler(game, repository, wallet, new InMemoryIdempotencyRepository(), operations, true);
        expect(await cold.reconcileOne("s", "one")).toMatchObject({status: "resumed"});
        expect(await wallet.getBalance("s")).toBe(balance);
        expect(await cold.execute({kind: "spin", sessionId: "s", requestId: "two"})).toMatchObject({status: "played"});
    });

    it("compensates coordinate serialization failure, evicts the failed live session and retries exactly once", async () => {
        const game = createOverscanGame();
        const serializer = game.getSessionSerializer!();
        let malformed = true;
        game.getSessionSerializer = () => ({getInitialData: session => serializer.getInitialData(session), getRoundData: session => {
            const payload = serializer.getRoundData(session);
            return malformed ? {...payload, reelsSymbols: (session as VideoSlotSessionHandling).getSymbolsCombination().toMatrix()} : payload;
        }});
        const session = game.createSession({seed: "7"});
        const repository = new InMemorySessionRepository(), 
            wallet = new InMemoryWallet(), 
            operations = new InMemorySpinOperationLog();
        const initial = captureInitialPokieSessionState({seed: "7"}, session, game.getSessionSerializer(), false, game);
        await repository.save("s", initial);
        await wallet.setBalance("s", initial.credits!);
        const handler = new SpinCommandHandler(game, repository, wallet, new InMemoryIdempotencyRepository<SpinCommandResult>(), operations, true);
        const failed = await handler.execute({kind: "spin", sessionId: "s", requestId: "coordinate-failure"});
        expect(failed).toMatchObject({status: "execution-error", reason: expect.stringContaining("visible viewport")});
        expect(await wallet.getBalance("s")).toBe(initial.credits);
        expect(await repository.load("s")).toEqual(initial);
        malformed = false;
        const retried = await handler.execute({kind: "spin", sessionId: "s", requestId: "coordinate-failure"});
        expect(retried.status).toBe("played");
        if (retried.status !== "played") throw new Error(JSON.stringify(retried));
        expect(retried.win).toBe(new ReplayRecorder().record({game, seed: "7", round: 1}).totalWin);
        const balance = await wallet.getBalance("s");
        expect(await handler.execute({kind: "spin", sessionId: "s", requestId: "coordinate-failure"})).toEqual(retried);
        expect(await wallet.getBalance("s")).toBe(balance);
    });

    it("enumerates generated evidence and includes evaluation geometry in checkpoint identity", async () => {
        const game = createOverscanGame({...overscanBlueprint, reelStrips: Array.from({length: 5}, () => ["A", "B"])});
        const {library} = await generateExactWeightedOutcomeLibrary({libraryId: "overscan", game, pokieVersion: "1.3.0", betMode: "base", stake: 1, maxOutcomeSpaceSize: BigInt(32)});
        expect(library.outcomes.every(outcome => outcome.artifact.generatedScreen?.[0].length === 7)).toBe(true);
    });

    it("keeps outcomes whose visible grids match but evaluated payout and generated evidence differ", async () => {
        const game = createOverscanGame({...overscanBlueprint, reelStrips: [["A", "B", "B", "B", "B", "S", "B", "B"], ["B"], ["B"], ["B"], ["B"]]});
        const {library} = await generateExactWeightedOutcomeLibrary({libraryId: "same-viewport", game, pokieVersion: "1.3.0", stake: 1});
        expect(library.outcomes).toHaveLength(8);
        const byViewport = new Map<string, typeof library.outcomes[number][]>();
        for (const outcome of library.outcomes) {
            const key = JSON.stringify(outcome.artifact.screen);
            byViewport.set(key, [...(byViewport.get(key) ?? []), outcome]);
        }
        expect([...byViewport.values()].some(outcomes => new Set(outcomes.map(outcome => outcome.artifact.totalWin)).size > 1)).toBe(true);
    });

    it("rejects checkpoint reuse when only evaluation geometry changes", async () => {
        const blueprint = {...overscanBlueprint, reelStrips: Array.from({length: 5}, () => ["A", "B"])};
        const game = createOverscanGame(blueprint);
        // Model authors can omit a config hash;
        // Coordinate evidence still owns sweep identity.
        Reflect.deleteProperty(game, "getConfigHash");
        let reads = 0;
        const signal = {get aborted() {
            return ++reads > 3; 
        }} as unknown as AbortSignal;
        let cancelled: WeightedOutcomeLibraryGenerationCancelledError | undefined;
        try {
            await generateExactWeightedOutcomeLibrary({libraryId: "checkpoint", game, pokieVersion: "1.3.0", signal});
        } catch (error) {
            expect(error).toBeInstanceOf(WeightedOutcomeLibraryGenerationCancelledError);
            cancelled = error as WeightedOutcomeLibraryGenerationCancelledError;
        }
        expect(cancelled?.checkpoint.sourceEnumerationId).toBeDefined();
        const changed = createOverscanGame({...blueprint, screenGeometry: {...overscanGeometry, evaluated: {rowOffset: 1, rows: 3}}});
        Reflect.deleteProperty(changed, "getConfigHash");
        await expect(generateExactWeightedOutcomeLibrary({libraryId: "checkpoint", game: changed, pokieVersion: "1.3.0", resumeFrom: cancelled!.checkpoint})).rejects.toThrow(/sourceEnumerationId/);
    });

    it("keeps multiplier lookup evaluation-local and maps every positional field in public artifacts", () => {
        const config = overscanConfig();
        const screen = adversarialScreen();
        screen[0][2] = "W";
        const calculator = new VideoSlotWinCalculator(config, undefined, undefined, undefined, undefined, undefined, {multiplierResolver: new MultiplierResolver({W: 2})});
        const session = new VideoSlotSession(config, {generateSymbolsCombination: () => combination(screen)}, calculator);
        session.play();
        expect(session.getWinAmount()).toBe(4);
        const artifact = buildRoundArtifactFromSession(session, {roundId: "multiplier", provenance});
        const publicView = new PublicRoundArtifactProjector().project(artifact);
        expect(artifact.wins[0].metadata.wildSymbolsPositions).toEqual([0]);
        expect(publicView.wins[0].metadata.wildSymbolsPositions).toEqual([0]);
        expect(publicView.wins[0].metadata.definition).toEqual([1, 1, 1, 1, 1]);
        expect(publicView.wins[0].multiplierBreakdown[0].positions).toEqual(artifact.wins[0].multiplierBreakdown[0].positions.map(([reel, row]) => [reel, row + 1]));
    });

    it("rejects injected evaluator and policy results outside the domain with optional validation disabled", () => {
        const component = new ValueWinComponent(new WinningValue("S", [[0, 6]], 1000));
        const evaluator: WinEvaluator = {evaluate: () => [component], getEvaluatorId: () => "custom", getEvaluatorGroup: () => "custom", getComponentType: () => "custom"};
        const context = new WinEvaluationContext(1, combination(), overscanConfig());
        expect(() => new WinEvaluationPipeline([evaluator], undefined, undefined, [], {validateOnEvaluate: false}).evaluate(context)).toThrow(/evaluation domain/);
        const policy = {getPolicyName: () => "custom", aggregate: () => [component]};
        expect(() => new WinEvaluationPipeline<string>([], policy, undefined, [], {validateOnEvaluate: false}).evaluate(context)).toThrow(/evaluation domain/);
    });

    it.each(["definition", "symbolsPositions", "wildSymbolsPositions", "winningPositions", "positionCell", "multiplierPositions", "multiplierBreakdown", "metadataPositions"] as const)("F2 rejects sparse injected %s before returning a paid evaluator or policy result", field => {
        const component = new LineWinComponent(new WinningLine(10, [0, 0, 0, 0, 0], [0, 1, 2], "custom", [0, 1, 2], [], "A"), [[0, 0], [1, 0], [2, 0]]);
        const sparse = new Array<number>(5);
        sparse[0] = sparse[1] = sparse[2] = 0;
        if (field === "definition" || field === "symbolsPositions" || field === "wildSymbolsPositions") {
            jest.spyOn(component, "getMetadata").mockReturnValue({...component.getMetadata(), [field]: sparse});
        } else if (field === "winningPositions" || field === "positionCell") {
            jest.spyOn(component, "getWinningPositions").mockReturnValue(field === "positionCell" ? [new Array<number>(2)] : new Array<number[]>(1));
        } else if (field === "multiplierPositions") {
            jest.spyOn(component, "getMultiplierBreakdown").mockReturnValue([{source: "custom", positions: new Array<number[]>(1), values: [2], combinedMultiplier: 2}]);
        } else if (field === "multiplierBreakdown") {
            const breakdown = component.getMultiplierBreakdown();
            breakdown.length = 1;
            jest.spyOn(component, "getMultiplierBreakdown").mockReturnValue(breakdown);
        } else {
            jest.spyOn(component, "getType").mockReturnValue("value");
            jest.spyOn(component, "getMetadata").mockReturnValue({symbolsPositions: new Array<number[]>(1)});
        }
        const evaluator: WinEvaluator = {evaluate: () => [component], getEvaluatorId: () => "custom", getEvaluatorGroup: () => "custom", getComponentType: () => "custom"};
        const context = new WinEvaluationContext(1, combination(), overscanConfig());
        expect(() => new WinEvaluationPipeline([evaluator], undefined, undefined, [], {validateOnEvaluate: false}).evaluate(context)).toThrow(/Evaluator returned|integer/);
        const policy = {getPolicyName: () => "custom", aggregate: () => [component]};
        expect(() => new WinEvaluationPipeline<string>([], policy, undefined, [], {validateOnEvaluate: false}).evaluate(context)).toThrow(/Evaluator returned|integer/);
        const config = overscanConfig();
        const calculator = new VideoSlotWinCalculator(config);
        jest.spyOn(calculator, "getWinEvaluationResult").mockReturnValue(new WinEvaluationResult({winComponents: [component]}));
        const session = new VideoSlotSession(config, {generateSymbolsCombination: () => combination()}, calculator);
        const credits = session.getCreditsAmount();
        expect(() => session.play()).toThrow(/Evaluator returned|integer/);
        expect(session.getCreditsAmount()).toBe(credits);
        expect(session.getWinAmount()).toBe(0);
        expect(session.getWinEvaluationResult().getWinComponents()).toEqual([]);
    });

    it("preserves replay screens, totals and step artifacts with explicit identity coordinates", () => {
        const blueprint = {...overscanBlueprint, screenGeometry: undefined};
        const identity: ScreenGeometry = {generated: {reels: 5, rows: 3}, visible: {rowOffset: 0, rows: 3}, evaluated: {rowOffset: 0, rows: 3}, paylineSpace: "evaluated"};
        const recorder = new ReplayRecorder();
        const ordinaryGame = createOverscanGame(blueprint);
        const explicitGame = createOverscanGame({...blueprint, screenGeometry: identity});
        const ordinary = recorder.record({game: ordinaryGame, seed: "7", round: 6});
        const explicit = recorder.record({game: explicitGame, seed: "7", round: 6});
        expect(explicit.screen).toEqual(ordinary.screen);
        expect(explicit.totalWin).toBe(ordinary.totalWin);
        expect(explicit.totalBet).toBe(ordinary.totalBet);
        expect(Object.keys(explicit).sort()).toEqual(Object.keys(ordinary).sort());
        for (const {descriptor, game} of [{descriptor: ordinary, game: ordinaryGame}, {descriptor: explicit, game: explicitGame}]) {
            const artifact = descriptor.artifact;
            if (!artifact) throw new Error("Video-slot replay must retain its executed step artifact.");
            const session = game.createSession({seed: "7"});
            session.setCreditsAmount(Number.MAX_SAFE_INTEGER);
            const runtime = new SessionRuntime(session);
            const results = Array.from({length: descriptor.round}, () => runtime.execute({kind: "spin"}));
            const finalResult = results[results.length - 1];
            if (finalResult.status !== "played") throw new Error("Seeded fixture must reach its final replay step.");
            expect(new RoundArtifactValidator().validate(artifact)).toEqual([]);
            expect(artifact).toMatchObject({roundId: "replay:7:6", stake: 0.05, betMode: "base", screen: descriptor.screen,
                provenance: {game: blueprint.manifest, pokieVersion: "1.3.0", configHash: game.getConfigHash!()}});
            expect(artifact).toMatchObject({stake: finalResult.stake, betMode: finalResult.mode, totalWin: finalResult.win});
            expect(artifact.steps).toHaveLength(1);
            expect(artifact.steps[0].screen).toEqual(descriptor.screen);
            expect(artifact.totalWin).toBe(artifact.steps[0].totalWin);
            expect(artifact.wins).toEqual(artifact.steps[0].wins);
            for (const source of [artifact, ...artifact.steps]) {
                expect(source).not.toHaveProperty("geometry");
                expect(source).not.toHaveProperty("generatedScreen");
                expect(source).not.toHaveProperty("sequenceSelections");
            }
        }
        // Explicit geometry changes model provenance, while the executed step remains identical.
        expect({...explicit.artifact, hash: undefined, provenance: undefined}).toEqual({...ordinary.artifact, hash: undefined, provenance: undefined});
    });

    it("preserves zero-overscan screen, stops, initialization consumption, payout and public shapes", () => {
        const config = overscanConfig();
        config.setScreenGeometry(undefined);
        const identity = overscanConfig();
        identity.setScreenGeometry({generated: {reels: 5, rows: 3}, visible: {rowOffset: 0, rows: 3}, evaluated: {rowOffset: 0, rows: 3}, paylineSpace: "evaluated"});
        const a = new SymbolsCombinationsGenerator(config, new SeededRandomNumberGenerator(7)),
            b = new SymbolsCombinationsGenerator(identity, new SeededRandomNumberGenerator(7));
        const left = new VideoSlotSession(config, a),
            right = new VideoSlotSession(identity, b);
        for (let round = 0;
            round < 6;
            round++) {
            expect(left.getSymbolsCombination().toMatrix()).toEqual(right.getSymbolsCombination().toMatrix());
            expect(a.getLastStopPositions()).toEqual(b.getLastStopPositions());
            expect(new VideoSlotSessionSerializer().getInitialData(left)).toEqual(new VideoSlotSessionSerializer().getInitialData(right));
            left.play();
            right.play();
            expect(left.getCreditsAmount()).toBe(right.getCreditsAmount());
        }
        expect(sessionStateSchemasMatch(left.getSessionStateSchema(), right.getSessionStateSchema())).toBe(true);
        expect(buildRoundArtifactFromSession(left, {roundId: "identity", provenance})).toEqual(buildRoundArtifactFromSession(right, {roundId: "identity", provenance}));
    });
});
