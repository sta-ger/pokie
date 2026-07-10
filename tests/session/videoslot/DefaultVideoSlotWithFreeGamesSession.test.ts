import {
    SymbolsCombinationsGenerator,
    VideoSlotWinCalculator,
    VideoSlotWithFreeGamesConfig,
    VideoSlotWithFreeGamesSession,
} from "pokie";
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
    testPlayFreeGames,
    testPlayUntilWinFreeGames,
    testSessionStateCaptureAndRestore,
} from "./DefaultVideoSlotWithFreeGamesSessionTestCases.js";

describe("VideoSlotWithFreeGamesSession", () => {
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
});
