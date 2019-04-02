import {IReelGameSessionConfig} from "./IReelGameSessionConfig";
import {ReelGameSessionReelsController} from "./reelscontroller/ReelGameSessionReelsController";
import {ReelGameSessionWinCalculator} from "./wincalculator/ReelGameSessionWinCalculator";
import {ReelGameWithFreeGamesSession} from "./ReelGameWithFreeGamesSession";
import {IReelGameWithFreeGamesSessionConfig} from "./IReelGameWithFreeGamesSessionConfig";
import {IReelGameWithFreeGamesSession} from "./IReelGameWithFreeGamesSession";
import {
    testDefaultSession,
    testSessionWithSpecifiedConfig,
    testSessionWithWrongInitialBet
} from "../../GameSession.test";
import {testDefaultReelGameSession, testPlayUntilWin} from "./ReelGameSession.test";
import {ReelGameWithFreeGamesSessionConfig} from "./ReelGameWithFreeGamesSessionConfig";

const testDefaultReelGameWithFreeGamesSession = (sessionClass, configClass) => {
    const config: IReelGameWithFreeGamesSessionConfig = new configClass();
    const session: IReelGameWithFreeGamesSession = new sessionClass(config, new ReelGameSessionReelsController(config), new ReelGameSessionWinCalculator(config));
    expect(session.getFreeGameNum()).not.toBeDefined();
    expect(session.getFreeGameSum()).not.toBeDefined();
    expect(session.getFreeGameBank()).not.toBeDefined();
};

const testPlayUntilWinFreeGames = (sessionClass, configClass) => {
    const config: IReelGameSessionConfig = new configClass();
    config.creditsAmount = Infinity;
    const session: IReelGameWithFreeGamesSession = new sessionClass(config, new ReelGameSessionReelsController(config), new ReelGameSessionWinCalculator(config));
    while (session.getFreeGameSum() === 0) {
        session.play();
    }
    expect(session.getFreeGameNum()).toBe(0);
    expect(session.getFreeGameSum()).toBeGreaterThan(0);
};

describe("ReelGameWithFreeGamesSession", () => {
    const sessionClass = ReelGameWithFreeGamesSession;
    const configClass = ReelGameWithFreeGamesSessionConfig;

    it("pass base tests", () => {
        testDefaultSession(sessionClass, configClass);
        testSessionWithSpecifiedConfig(sessionClass, configClass);
        testSessionWithWrongInitialBet(sessionClass, configClass);
        testDefaultReelGameSession(sessionClass, configClass);
        testPlayUntilWin(sessionClass, configClass);
    });

    it("creates default reel game with free games session", () => {
        testDefaultReelGameWithFreeGamesSession(sessionClass, configClass);
    });

    it("should several times play until won free games", () => {
        testPlayUntilWinFreeGames(sessionClass, configClass);
    });

});
