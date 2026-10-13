import {GameSession, GameSessionConfig} from "@fromstan/pokie";
import {FRACTIONAL_BET_STAKES} from "../fixtures/math/FractionalBetFixture.js";
import {
    createCustomConfigForTestProperInitialValues,
    createCustomConfigForWrongBetTest,
    testDefaultSessionDoesNotPlayWithoutEnoughCredits,
    testDefaultSessionHasProperInitialValues,
    testDefaultSessionHasProperInitialValuesWithCustomConfig,
    testDefaultSessionPlaysWhileEnoughCredits,
    testDefaultSessionWithWrongInitialBet,
} from "./DefaultGameSessionTestCases.js";

describe("GenericGameSession", () => {
    it("selects fractional/scientific bets exactly and preserves unavailable-bet fallback", () => {
        const config = new GameSessionConfig();
        config.setAvailableBets(FRACTIONAL_BET_STAKES);
        const session = new GameSession(config);
        for (const bet of FRACTIONAL_BET_STAKES) {
            session.setBet(bet);
            expect(session.getBet()).toBe(bet);
            const credits = session.getCreditsAmount();
            session.play();
            expect(session.getCreditsAmount()).toBe(credits - bet);
        }
        session.setBet(99);
        expect(session.getBet()).toBe(FRACTIONAL_BET_STAKES[0]);
        session.setCreditsAmount(0);
        expect(session.canPlayNextGame()).toBe(false);
        session.play();
        expect(session.getCreditsAmount()).toBe(0);
    });

    it("keeps the plain built-in base codec strict", () => {
        const session = new GameSession();
        expect(session.getSessionStateSchema()).toEqual({kind: "base"});
        expect(session.isSessionStateRestorable()).toBe(true);
        expect(session.toSessionState()).toEqual({});
        expect(session.fromSessionState({})).toBe(session);
        for (const state of [null, [], {round: 1}]) expect(() => session.fromSessionState(state)).toThrow("Invalid base game state");
    });

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

    it("does not play without enough credits", () => {
        const conf = new GameSessionConfig();
        const sess = new GameSession(conf);
        testDefaultSessionDoesNotPlayWithoutEnoughCredits(sess);
    });
});
