import {
    GameSession,
    VideoSlotSession,
    VideoSlotConfig,
    SymbolsCombinationsGenerator,
    VideoSlotWinCalculator,
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

describe("DefaultVideoSlotSession", () => {
    it("should return outcome symbols matrix", () => {
        const conf = new VideoSlotConfig();
        const sess = new VideoSlotSession(
            conf,
            new SymbolsCombinationsGenerator(conf),
            new VideoSlotWinCalculator(conf),
            new GameSession(conf),
        );
        expect(sess.getSymbolsCombination().toMatrix()).toHaveLength(conf.getReelsNumber());
        expect(sess.getSymbolsCombination().getSymbols(0)).toHaveLength(conf.getReelsSymbolsNumber());
    });

    it("should pass base tests", () => {
        let conf = new VideoSlotConfig();

        let sess = new VideoSlotSession(
            conf,
            new SymbolsCombinationsGenerator(conf),
            new VideoSlotWinCalculator(conf),
            new GameSession(conf),
        );
        testDefaultSessionHasProperInitialValues(sess, conf);

        let baseConf = createCustomConfigForTestProperInitialValues();
        conf = new VideoSlotConfig();
        conf.setAvailableBets(baseConf.getAvailableBets());
        conf.setCreditsAmount(baseConf.getCreditsAmount());
        sess = new VideoSlotSession(
            conf,
            new SymbolsCombinationsGenerator(conf),
            new VideoSlotWinCalculator(conf),
            new GameSession(conf),
        );
        testDefaultSessionHasProperInitialValuesWithCustomConfig(sess, conf);

        baseConf = createCustomConfigForWrongBetTest();
        conf = new VideoSlotConfig();
        conf.setAvailableBets(baseConf.getAvailableBets());
        sess = new VideoSlotSession(
            conf,
            new SymbolsCombinationsGenerator(conf),
            new VideoSlotWinCalculator(conf),
            new GameSession(conf),
        );
        testDefaultSessionWithWrongInitialBet(sess, conf);
    });

    it("should test create new session", () => {
        const conf = new VideoSlotConfig();
        const sess = new VideoSlotSession(
            conf,
            new SymbolsCombinationsGenerator(conf),
            new VideoSlotWinCalculator(conf),
            new GameSession(conf),
        );
        testDefaultVideoSlotSessionHasProperInitialValues(sess, conf);
    });

    it("should test play several times until any winning", () => {
        const conf = new VideoSlotConfig();
        conf.setCreditsAmount(Infinity);
        const sess = new VideoSlotSession(
            conf,
            new SymbolsCombinationsGenerator(conf),
            new VideoSlotWinCalculator(conf),
            new GameSession(conf),
        );
        testPlayUntilWin(sess, conf);
    });
});
