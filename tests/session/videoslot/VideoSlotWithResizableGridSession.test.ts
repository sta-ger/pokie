import {
    GridResizeHandling,
    ResizableSymbolsCombinationsGenerator,
    VideoSlotConfig,
    VideoSlotSession,
    VideoSlotSessionHandling,
    VideoSlotWinCalculator,
    VideoSlotWithResizableGridSession,
    VariableHeightSymbolsCombinationsGenerator,
    CustomLinesDefinitions,
    SymbolsSequence,
    Paytable,
    LineWinCalculator,
    SessionRuntime, VideoSlotSessionSerializer,
    VideoSlotWithBetModesSession,
    BetModesConfig,
    BetModeDefinition,
} from "@fromstan/pokie";

describe("VideoSlotWithResizableGridSession", () => {
    test.each(["resizable", "variable"])("authored rows above configured height settle on ordinary %s grids", kind => {
        const config = new VideoSlotConfig();
        config.setAvailableBets([1]);
        config.setBet(1);
        config.setSymbolsSequences(Array.from({length: 5}, () => new SymbolsSequence().fromArray(["A", "A", "A", "A", "A"])));
        config.setLinesDefinitions(new CustomLinesDefinitions().setLineDefinition("high", [4, 4, 4, 4, 4]));
        const paytable = new Paytable<string>([1]);
        paytable.setPayoutForSymbol("A", 5, 9);
        config.setPaytable(paytable);
        const rng = {getRandomInt: () => 0};
        const generator = kind === "resizable"
            ? new ResizableSymbolsCombinationsGenerator(config, [5, 5, 5, 5, 5], rng)
            : new VariableHeightSymbolsCombinationsGenerator(config, Array.from({length: 5}, () => new SymbolsSequence<number>().fromArray([5])), rng);
        const direct = new LineWinCalculator(config).calculateWinningLines(1, generator.generateSymbolsCombination());
        expect(direct.high.getWinAmount()).toBe(9);
        const base = new VideoSlotSession(config, generator);
        const credits = base.getCreditsAmount();
        base.play();
        expect(base.getWinAmount()).toBe(direct.high.getWinAmount());
        expect(base.getCreditsAmount()).toBe(credits + 8);
        const ante = new VideoSlotWithBetModesSession(base, new BetModesConfig([
            new BetModeDefinition("base"), new BetModeDefinition("ante", {stakeMultiplier: 2}),
        ]));
        const runtime = new SessionRuntime(ante);
        expect(runtime.execute({kind: "spin", mode: "ante"})).toMatchObject({status: "played", win: 9});
        expect(ante.getCreditsAmount()).toBe(credits + 15);
        expect(ante.getSymbolsCombination().toMatrix()).toEqual(Array.from({length: 5}, () => ["A", "A", "A", "A", "A"]));
        expect(ante.getScreenGeometry()).toBeUndefined();
        expect(ante.getEvaluatedSymbolsCombination().toMatrix()).toEqual(ante.getSymbolsCombination().toMatrix());
    });

    test.each(["direct", "runtime", "prepared"])("F1g %s execution exposes settled results after repairing rejected heights", entry => {
        const config = new VideoSlotConfig();
        config.setAvailableBets([1]);
        config.setBet(1);
        config.setSymbolsSequences(Array.from({length: 5}, () => new SymbolsSequence().fromArray(["A", "A", "A", "A", "A"])));
        config.setLinesDefinitions(new CustomLinesDefinitions().setLineDefinition("high", [4, 4, 4, 4, 4]));
        const paytable = new Paytable<string>([1]);
        paytable.setPayoutForSymbol("A", 5, 9);
        config.setPaytable(paytable);
        const heights = [5, 5, 5, 5, 5];
        const generator = new ResizableSymbolsCombinationsGenerator(config, heights, {getRandomInt: () => 0});
        const base = new VideoSlotSession(config, generator);
        const resize = {getNextReelsHeights: jest.fn((_session, current: number[]) => current)};
        const session = new VideoSlotWithResizableGridSession(base, generator, resize);
        session.setCreditsAmount(100);
        const runtime = new SessionRuntime(session);
        const execute = () => {
            if (entry === "direct") return session.play();
            if (entry === "runtime") return runtime.execute({kind: "spin"});
            const ready = runtime.prepare({kind: "spin"}, session.getCreditsAmount());
            if (ready.status !== "ready") throw new Error(ready.reason);
            return ready.execute();
        };
        const serializer = new VideoSlotSessionSerializer();
        execute();
        expect(session.getCreditsAmount()).toBe(108);
        generator.setReelsHeights([4, 4, 4, 4, 4]);
        expect(() => execute()).toThrow(/evaluation domain/);
        expect(session.getCreditsAmount()).toBe(108);
        expect(session.getWinAmount()).toBe(0);
        expect(session.getWinEvaluationResult().getWinComponents()).toEqual([]);
        session.setCreditsAmount(0);
        session.play(); // A no-op must not revive the invalid result.
        expect(session.getWinAmount()).toBe(0);
        expect(runtime.execute({kind: "spin", bet: 99})).toMatchObject({status: "invalid-command"});
        expect(session.getWinEvaluationResult().getWinComponents()).toEqual([]);
        session.setCreditsAmount(108);
        generator.setReelsHeights(heights);
        for (const credits of [116, 124]) {
            const result = execute();
            if (entry !== "direct") expect(result).toMatchObject({status: "played", win: 9, credits});
            expect(session.getCreditsAmount()).toBe(credits);
            expect(session.getWinAmount()).toBe(base.getWinAmount());
            expect(session.getWinAmount()).toBe(9);
            expect(session.getWinEvaluationResult().getWinComponents()).toHaveLength(1);
            expect(serializer.getRoundData(session)).toMatchObject({totalWin: 9, credits});
            expect(Object.keys(session.getWinningLines())).toEqual(["high"]);
        }
    });

    test("changed ordinary heights validate the new matrix before settlement or resize-handler mutation", () => {
        const config = new VideoSlotConfig();
        config.setAvailableBets([1]);
        config.setBet(1);
        config.setSymbolsSequences(Array.from({length: 5}, () => new SymbolsSequence().fromArray(["A", "A", "A", "A", "A"])));
        config.setLinesDefinitions(new CustomLinesDefinitions().setLineDefinition("high", [4, 4, 4, 4, 4]));
        const paytable = new Paytable<string>([1]);
        paytable.setPayoutForSymbol("A", 5, 9);
        config.setPaytable(paytable);
        const generator = new ResizableSymbolsCombinationsGenerator(config, [5, 5, 5, 5, 5], {getRandomInt: () => 0});
        const base = new VideoSlotSession(config, generator);
        const resize = {getNextReelsHeights: jest.fn((_session, heights: number[]) => heights)};
        const session = new VideoSlotWithResizableGridSession(base, generator, resize);
        session.play();
        generator.setReelsHeights([6, 6, 6, 6, 6]);
        config.setLinesDefinitions(new CustomLinesDefinitions().setLineDefinition("high", [5, 5, 5, 5, 5]));
        expect(new SessionRuntime(session).execute({kind: "spin"})).toMatchObject({status: "played", win: 9});
        expect(session.getSymbolsCombination().toMatrix()[0]).toHaveLength(6);
        const credits = session.getCreditsAmount();
        resize.getNextReelsHeights.mockClear();
        generator.setReelsHeights([4, 4, 4, 4, 4]);
        expect(() => session.play()).toThrow(/evaluation domain/);
        expect(session.getCreditsAmount()).toBe(credits);
        expect(session.getSymbolsCombination().toMatrix()[0]).toHaveLength(6);
        expect(session.getWinAmount()).toBe(0);
        expect(resize.getNextReelsHeights).not.toHaveBeenCalled();
    });

    test("a rejecting resize handler rolls back the settled step and heights, then permits retry", () => {
        const config = new VideoSlotConfig();
        config.setAvailableBets([1]);
        config.setBet(1);
        config.setSymbolsSequences(Array.from({length: 5}, () => new SymbolsSequence().fromArray(["A"])));
        config.setLinesDefinitions(new CustomLinesDefinitions().setLineDefinition("line", [0, 0, 0, 0, 0]));
        const paytable = new Paytable<string>([1]);
        paytable.setPayoutForSymbol("A", 5, 9);
        config.setPaytable(paytable);
        const heights = [3, 3, 3, 3, 3];
        const generator = new ResizableSymbolsCombinationsGenerator(config, heights, {getRandomInt: () => 0});
        let reject = true;
        const session = new VideoSlotWithResizableGridSession(new VideoSlotSession(config, generator), generator, {
            getNextReelsHeights: () => {
                if (reject) {
                    generator.setReelsHeights([4, 4, 4, 4, 4]);
                    throw new Error("resize rejected");
                }
                return [5, 5, 5, 5, 5];
            },
        });
        session.setCreditsAmount(100);
        expect(() => session.play()).toThrow("resize rejected");
        expect(session.getCreditsAmount()).toBe(100);
        expect(session.getReelsHeights()).toEqual(heights);
        expect(session.getWinAmount()).toBe(0);
        expect(session.getWinEvaluationResult().getWinComponents()).toEqual([]);
        reject = false;
        session.play();
        expect(session.getCreditsAmount()).toBe(108);
        expect(session.getWinAmount()).toBe(9);
        expect(session.getWinEvaluationResult().getWinComponents()).toHaveLength(1);
        expect(session.getReelsHeights()).toEqual([5, 5, 5, 5, 5]);
    });

    test("play() delegates to the base session, passes it and the current heights to the handler, and applies its result", () => {
        const config = new VideoSlotConfig();
        config.setReelsNumber(3);
        const generator = new ResizableSymbolsCombinationsGenerator(config, [3, 3, 3]);
        const baseSession = new VideoSlotSession(config, generator, new VideoSlotWinCalculator(config));

        const calls: {session: VideoSlotSessionHandling; currentHeights: number[]}[] = [];
        const gridResizeHandling: GridResizeHandling = {
            getNextReelsHeights: (session, currentHeights): number[] => {
                calls.push({session, currentHeights: [...currentHeights]});
                return currentHeights.map((h) => h + 1);
            },
        };
        const resizableSession = new VideoSlotWithResizableGridSession(baseSession, generator, gridResizeHandling);

        resizableSession.play();

        expect(calls).toHaveLength(1);
        expect(calls[0].session).toBe(baseSession);
        expect(calls[0].currentHeights).toEqual([3, 3, 3]);
        expect(resizableSession.getReelsHeights()).toEqual([4, 4, 4]);
        expect(generator.getReelsHeights()).toEqual([4, 4, 4]);
    });

    test("the grid can shrink as well as grow, depending on the injected handler", () => {
        const config = new VideoSlotConfig();
        config.setReelsNumber(2);
        const generator = new ResizableSymbolsCombinationsGenerator(config, [5, 5]);
        const baseSession = new VideoSlotSession(config, generator, new VideoSlotWinCalculator(config));

        const gridResizeHandling: GridResizeHandling = {
            getNextReelsHeights: (_session, currentHeights): number[] => currentHeights.map((h) => h - 1),
        };
        const resizableSession = new VideoSlotWithResizableGridSession(baseSession, generator, gridResizeHandling);

        resizableSession.play();
        expect(resizableSession.getReelsHeights()).toEqual([4, 4]);

        resizableSession.play();
        expect(resizableSession.getReelsHeights()).toEqual([3, 3]);
    });

    test("a resize only takes effect starting from the next round, not the one that triggered it", () => {
        const config = new VideoSlotConfig();
        config.setReelsNumber(2);
        const generator = new ResizableSymbolsCombinationsGenerator(config, [2, 2]);
        const baseSession = new VideoSlotSession(config, generator, new VideoSlotWinCalculator(config));

        const gridResizeHandling: GridResizeHandling = {
            getNextReelsHeights: (_session, currentHeights): number[] => currentHeights.map((h) => h + 2),
        };
        const resizableSession = new VideoSlotWithResizableGridSession(baseSession, generator, gridResizeHandling);

        resizableSession.play();
        expect(resizableSession.getSymbolsCombination().toMatrix()[0]).toHaveLength(2);

        resizableSession.play();
        expect(resizableSession.getSymbolsCombination().toMatrix()[0]).toHaveLength(4);
    });
});
