import {
    FreeGamesRoundHandler, VideoSlotSessionSerializer,
    Paytable,
    SeededRandomNumberGenerator,
    SymbolsSequence,
    SymbolsCombinationsGenerator,
    VideoSlotWinCalculator,
    VideoSlotWithFreeGamesConfig,
    VideoSlotWithFreeGamesSession,
} from "@fromstan/pokie";
import {goldenVideoSlotSymbolsSequences} from "./VideoSlotGoldenTestFixtures.js";
import {
    createCustomConfigForTestProperInitialValues,
    createCustomConfigForWrongBetTest,
    testDefaultSessionHasProperInitialValues,
    testDefaultSessionHasProperInitialValuesWithCustomConfig,
    testDefaultSessionWithWrongInitialBet,
} from "../DefaultGameSessionTestCases.js";
import {
    testDefaultVideoSlotSessionHasProperInitialValues,
    testPlayUntilWin,
} from "./DefaultVideoSlotSessionTestCases.js";
import {
    createConfigForTestPlayFreeGames,
    testCanPlayNextGameDuringFreeGames,
    testDefaultVideoSlotWithFreeGamesSession,
    testFreeGamesGettersSetters,
    testInsufficientCreditsBlocksNormalSpin,
    testPlayFreeGames,
    testPlayUntilWinFreeGames,
    testSessionStateCaptureAndRestore,
    testUnfinishedFreeRoundPlaysDespiteInsufficientCredits,
} from "./DefaultVideoSlotWithFreeGamesSessionTestCases.js";

describe("VideoSlotWithFreeGamesSession", () => {
    it("rolls back a rejected custom round handler without requiring persistence certification", () => {
        const config = new VideoSlotWithFreeGamesConfig();
        const standard = new FreeGamesRoundHandler();
        let reject = true;
        const session = new VideoSlotWithFreeGamesSession(config,
            new SymbolsCombinationsGenerator(config, new SeededRandomNumberGenerator(31)), undefined, undefined, {
                beforeRoundPlayed: target => standard.beforeRoundPlayed(target),
                afterRoundPlayed: (target, credits) => {
                    standard.afterRoundPlayed(target, credits);
                    if (reject) throw new Error("custom settlement rejected");
                },
            });
        session.setFreeGamesSum(2);
        session.setCreditsAmount(0);
        const before = session.toSessionState();
        expect(session.isSessionStateRestorable()).toBe(false);
        expect(() => session.play()).toThrow("custom settlement rejected");
        expect(session.getCreditsAmount()).toBe(0);
        expect(session.toSessionState()).toEqual(before);
        expect(session.getWinAmount()).toBe(0);
        reject = false;
        session.play();
        expect(session.getFreeGamesNum()).toBe(1);
        expect(session.getCreditsAmount()).toBe(0);
    });

    it.each([undefined, 0])("reports only played-round grants with scatter money %s, preserving no-ops and constructor draws", multiplier => {
        const config = new VideoSlotWithFreeGamesConfig();
        config.setReelsNumber(3);
        config.setReelsSymbolsNumber(1);
        config.setAvailableBets([1]);
        config.setBet(1);
        config.setSymbolsSequences(Array.from({length: 3}, () => new SymbolsSequence().fromArray(["S"])));
        const paytable = new Paytable([1]);
        if (multiplier !== undefined) paytable.setPayoutForSymbol("S", 3, multiplier);
        config.setPaytable(paytable);
        const rng = new SeededRandomNumberGenerator("0");
        const expectedRng = new SeededRandomNumberGenerator("0");
        const session = new VideoSlotWithFreeGamesSession(config, new SymbolsCombinationsGenerator(config, rng));
        const expectThreeDraws = () => {
            for (let reel = 0; reel < 3; reel++) expectedRng.getRandomInt(0, 1);
            expect(rng.toSessionState()).toBe(expectedRng.toSessionState());
        };
        expectThreeDraws(); // The constructor still consumes one draw per reel.
        expect(session.getSymbolsCombination().toMatrix()).toEqual([["S"], ["S"], ["S"]]);
        expect(session.getWonFreeGamesNumber()).toBe(0);
        expect(session.getFreeGamesSum()).toBe(0);
        session.setCreditsAmount(0);
        const initialState = session.toSessionState();
        session.play();
        expect(session.toSessionState()).toEqual(initialState);
        expect(session.getWonFreeGamesNumber()).toBe(0);

        session.setCreditsAmount(1);
        session.play();
        expectThreeDraws();
        expect(session.getWinAmount()).toBe(0);
        expect(session.getWinningScatters()).toEqual({});
        expect(session.getWonFreeGamesNumber()).toBe(10);
        expect(session.getFreeGamesSum()).toBe(10);
        expect(session.getCreditsAmount()).toBe(0);
        session.play(); // Free spins remain playable with no real credits.
        expectThreeDraws();
        expect(session.getWonFreeGamesNumber()).toBe(10);
        expect(session.getFreeGamesNum()).toBe(1);
        expect(session.getFreeGamesSum()).toBe(20);
        expect(session.getCreditsAmount()).toBe(0);

        session.setFreeGamesNum(session.getFreeGamesSum());
        const completedState = session.toSessionState();
        session.play(); // An unaffordable paid spin must neither clear nor reprocess the last grant.
        expect(session.toSessionState()).toEqual(completedState);
        expect(session.getWonFreeGamesNumber()).toBe(10);
        session.setCreditsAmount(1);
        config.setSymbolsSequences(Array.from({length: 3}, () => new SymbolsSequence().fromArray(["A"])));
        session.play();
        expectThreeDraws();
        expect(session.getWonFreeGamesNumber()).toBe(0);
        expect(session.getFreeGamesSum()).toBe(0);
    });

    it("F1g explicit restoration recovers the same grant on a previously rejected instance", () => {
        const config = new VideoSlotWithFreeGamesConfig();
        config.setReelsNumber(3);
        config.setReelsSymbolsNumber(1);
        config.setAvailableBets([1, 2]);
        config.setBet(1);
        config.setSymbolsSequences(Array.from({length: 3}, () => new SymbolsSequence().fromArray(["S"])));
        config.setFreeGamesForScatters("S", 3, 2);
        const paytable = new Paytable<string>([1, 2]);
        paytable.setPayoutForSymbol("S", 3, 0);
        config.setPaytable(paytable);
        const create = () => new VideoSlotWithFreeGamesSession(config, new SymbolsCombinationsGenerator(config, new SeededRandomNumberGenerator(31)));
        const session = create();
        session.play();
        expect(session.getWonFreeGamesNumber()).toBe(2);
        const state = JSON.parse(JSON.stringify(session.toSessionState()));
        const credits = session.getCreditsAmount();
        const fresh = create().fromSessionState(state);
        fresh.setCreditsAmount(credits);
        const serializer = new VideoSlotSessionSerializer();
        for (let attempt = 0; attempt < 2; attempt++) {
            paytable.setPayoutForSymbol("S", 3, Number.MAX_VALUE);
            session.setBet(2);
            expect(() => session.play()).toThrow(/overflow/);
            expect(session.getWonFreeGamesNumber()).toBe(0);
            expect(session.getWinAmount()).toBe(0);
            expect(session.toSessionState()).toEqual(state);
            paytable.setPayoutForSymbol("S", 3, 0);
            session.setBet(1);
            session.fromSessionState(state);
            expect(session.toSessionState()).toEqual(fresh.toSessionState());
            expect(session.getWonFreeGamesNumber()).toBe(2);
            expect(session.getWonFreeGamesNumber()).toBe(fresh.getWonFreeGamesNumber());
            expect(serializer.getRoundData(session)).toEqual(serializer.getRoundData(fresh));
        }
        session.play();
        fresh.play();
        expect(session.toSessionState()).toEqual(fresh.toSessionState());
        expect(session.getCreditsAmount()).toBe(fresh.getCreditsAmount());
        expect(session.getWonFreeGamesNumber()).toBe(fresh.getWonFreeGamesNumber());
    });

    it("restores played-round grants and seeded continuation without evaluating a fresh display screen", () => {
        const config = new VideoSlotWithFreeGamesConfig();
        config.setSymbolsSequences(goldenVideoSlotSymbolsSequences());
        const createSession = () => new VideoSlotWithFreeGamesSession(config, new SymbolsCombinationsGenerator(config, new SeededRandomNumberGenerator(313)));
        const live = createSession();
        live.play();
        expect(live.getWonFreeGamesNumber()).toBe(10);
        const state = JSON.parse(JSON.stringify(live.toSessionState()));
        const restored = createSession().fromSessionState(state);
        restored.setCreditsAmount(live.getCreditsAmount());
        expect(restored.getWonFreeGamesNumber()).toBe(10);
        expect(restored.toSessionState()).toEqual(live.toSessionState());
        for (let round = 0; round < 12; round++) {
            live.play();
            restored.play();
            expect(restored.getSymbolsCombination().toMatrix()).toEqual(live.getSymbolsCombination().toMatrix());
            expect(restored.getWonFreeGamesNumber()).toBe(live.getWonFreeGamesNumber());
            expect(restored.getWinAmount()).toBe(live.getWinAmount());
            expect(restored.getCreditsAmount()).toBe(live.getCreditsAmount());
            expect(restored.toSessionState()).toEqual(live.toSessionState());
        }
        // Legacy states contain counters/RNG only; they cannot prove a last-round award.
        restored.fromSessionState({freeGamesNum: 0, freeGamesSum: 0, freeGamesBank: 0, base: state.base});
        expect(restored.getWonFreeGamesNumber()).toBe(0);
    });

    it("should pass base tests", () => {
        let conf = new VideoSlotWithFreeGamesConfig();
        let sess = new VideoSlotWithFreeGamesSession(
            conf,
            new SymbolsCombinationsGenerator(conf),
            new VideoSlotWinCalculator(conf),
        );
        testDefaultSessionHasProperInitialValues(sess, conf);

        let baseConf = createCustomConfigForTestProperInitialValues();
        conf = new VideoSlotWithFreeGamesConfig();
        conf.setAvailableBets(baseConf.getAvailableBets());
        conf.setCreditsAmount(baseConf.getCreditsAmount());
        sess = new VideoSlotWithFreeGamesSession(
            conf,
            new SymbolsCombinationsGenerator(conf),
            new VideoSlotWinCalculator(conf),
        );
        testDefaultSessionHasProperInitialValuesWithCustomConfig(sess, conf);

        baseConf = createCustomConfigForWrongBetTest();
        conf = new VideoSlotWithFreeGamesConfig();
        conf.setAvailableBets(baseConf.getAvailableBets());
        sess = new VideoSlotWithFreeGamesSession(
            conf,
            new SymbolsCombinationsGenerator(conf),
            new VideoSlotWinCalculator(conf),
        );
        testDefaultSessionWithWrongInitialBet(sess, conf);

        const configForTestVideoSlotBaseTests = new VideoSlotWithFreeGamesConfig();
        conf.getScatterSymbols().forEach((scatter) => {
            for (
                let i = 0;
                i <
                configForTestVideoSlotBaseTests.getReelsNumber() *
                    configForTestVideoSlotBaseTests.getReelsSymbolsNumber();
                i++
            ) {
                configForTestVideoSlotBaseTests.setFreeGamesForScatters(scatter, i, 0);
            }
        });
        sess = new VideoSlotWithFreeGamesSession(
            configForTestVideoSlotBaseTests,
            new SymbolsCombinationsGenerator(configForTestVideoSlotBaseTests),
            new VideoSlotWinCalculator(configForTestVideoSlotBaseTests),
        );
        testDefaultVideoSlotSessionHasProperInitialValues(sess, configForTestVideoSlotBaseTests);
        testPlayUntilWin(sess, configForTestVideoSlotBaseTests);
    });

    it("should set fee games num sum bank properly", () => {
        const conf = createConfigForTestPlayFreeGames();
        const session = new VideoSlotWithFreeGamesSession(
            conf,
            new SymbolsCombinationsGenerator(conf),
            new VideoSlotWinCalculator(conf),
        );
        testFreeGamesGettersSetters(session);
    });

    it("should create default reel game with free games session", () => {
        const conf = createConfigForTestPlayFreeGames();
        const session = new VideoSlotWithFreeGamesSession(
            conf,
            new SymbolsCombinationsGenerator(conf),
            new VideoSlotWinCalculator(conf),
        );
        testDefaultVideoSlotWithFreeGamesSession(session);
    });

    it("should play until win free games", () => {
        const conf = createConfigForTestPlayFreeGames();
        const session = new VideoSlotWithFreeGamesSession(
            conf,
            new SymbolsCombinationsGenerator(conf),
            new VideoSlotWinCalculator(conf),
        );
        testPlayUntilWinFreeGames(session);
    });

    it("should play free games", () => {
        const conf = createConfigForTestPlayFreeGames();
        const session = new VideoSlotWithFreeGamesSession(
            conf,
            new SymbolsCombinationsGenerator(conf),
            new VideoSlotWinCalculator(conf),
        );
        testPlayFreeGames(session, conf);
    });

    it("can play the next game during an unfinished free-games round regardless of credits", () => {
        const conf = createConfigForTestPlayFreeGames();
        const session = new VideoSlotWithFreeGamesSession(
            conf,
            new SymbolsCombinationsGenerator(conf),
            new VideoSlotWinCalculator(conf),
        );
        testCanPlayNextGameDuringFreeGames(session);
    });

    it("should capture and restore free games state via toSessionState/fromSessionState", () => {
        const conf = createConfigForTestPlayFreeGames();
        const session = new VideoSlotWithFreeGamesSession(
            conf,
            new SymbolsCombinationsGenerator(conf),
            new VideoSlotWinCalculator(conf),
        );
        const otherSession = new VideoSlotWithFreeGamesSession(
            conf,
            new SymbolsCombinationsGenerator(conf),
            new VideoSlotWinCalculator(conf),
        );
        testSessionStateCaptureAndRestore(session, otherSession);
    });

    it("does not play a normal spin when credits are insufficient for the bet", () => {
        const conf = createConfigForTestPlayFreeGames();
        const session = new VideoSlotWithFreeGamesSession(
            conf,
            new SymbolsCombinationsGenerator(conf),
            new VideoSlotWinCalculator(conf),
        );
        testInsufficientCreditsBlocksNormalSpin(session);
    });

    it("plays an unfinished free round despite insufficient real-money credits", () => {
        const conf = createConfigForTestPlayFreeGames();
        const session = new VideoSlotWithFreeGamesSession(
            conf,
            new SymbolsCombinationsGenerator(conf),
            new VideoSlotWinCalculator(conf),
        );
        testUnfinishedFreeRoundPlaysDespiteInsufficientCredits(session);
    });
});
