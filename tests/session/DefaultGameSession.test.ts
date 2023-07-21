import {GameSession, GameSessionConfig} from "pokie";
import {
    createCustomConfigForTestProperInitialValues,
    createCustomConfigForWrongBetTest,
    testDefaultSessionHasProperInitialValues,
    testDefaultSessionHasProperInitialValuesWithCustomConfig,
    testDefaultSessionPlaysWhileEnoughCredits,
    testDefaultSessionWithWrongInitialBet,
} from "./DefaultGameSessionTestCases.js";

describe("GenericGameSession", () => {
    it("creates a new session", () => {
        const conf = new GameSessionConfig();
        const sess = new GameSession(conf);
        testDefaultSessionHasProperInitialValues(sess, conf);
    });

    it("creates a new session with custom config", () => {
        const conf = createCustomConfigForTestProperInitialValues();
        const sess = new GameSession(conf);
        testDefaultSessionHasProperInitialValuesWithCustomConfig(sess, conf);
    });

    it("creates a new session with wrong bet", () => {
        const conf = createCustomConfigForWrongBetTest();
        const sess = new GameSession(conf);
        testDefaultSessionWithWrongInitialBet(sess, createCustomConfigForTestProperInitialValues());
    });

    it("plays while enough credits", () => {
        const conf = new GameSessionConfig();
        const sess = new GameSession(conf);
        testDefaultSessionPlaysWhileEnoughCredits(sess);
    });
});
