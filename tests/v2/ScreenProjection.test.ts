import {
    ScreenProjection, SymbolsCombination, SymbolsCombinationsGenerator, SeededRandomNumberGenerator,
    VideoSlotSession, VideoSlotSessionSerializer, VideoSlotWinCalculator, LineWinCalculator, ScatterWinCalculator,
    WaysWinCalculator, ClusterWinCalculator, ValueWinCalculator, WinEvaluationContext, WinEvaluationPipeline,
    CustomLinesDefinitions,
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
    CascadingSpinResolver, VideoSlotWithHoldAndWinSession, VideoSlotWithJackpotSession,
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

    it("presents viewport-local highlights while retaining immutable generated/evaluated artifact evidence", () => {
        const session = fixedSession();
        session.play();
        const serializer = new VideoSlotSessionSerializer();
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

    it("preserves the legacy replay shape with explicit identity coordinates", () => {
        const blueprint = {...overscanBlueprint, screenGeometry: undefined};
        const identity: ScreenGeometry = {generated: {reels: 5, rows: 3}, visible: {rowOffset: 0, rows: 3}, evaluated: {rowOffset: 0, rows: 3}, paylineSpace: "evaluated"};
        const recorder = new ReplayRecorder();
        const ordinary = recorder.record({game: createOverscanGame(blueprint), seed: "7", round: 6});
        const explicit = recorder.record({game: createOverscanGame({...blueprint, screenGeometry: identity}), seed: "7", round: 6});
        expect(explicit.screen).toEqual(ordinary.screen);
        expect(explicit.totalWin).toBe(ordinary.totalWin);
        expect(explicit.totalBet).toBe(ordinary.totalBet);
        expect(explicit).not.toHaveProperty("artifact");
        expect(Object.keys(explicit).sort()).toEqual(Object.keys(ordinary).sort());
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
