import {GameSession} from "./GameSession";
import {IGameSession} from "./IGameSession";
import {IGameSessionConfig} from "./IGameSessionConfig";
import {GameSessionConfig} from "./GameSessionConfig";

const testDefaultSession = (sessionClass: any, configClass: any) => {
    const config: IGameSessionConfig = new configClass();
    const session: IGameSession = new sessionClass(config);
    expect(session.getAvailableBets()).toEqual(config.availableBets);
    expect(session.getBet()).toBe(config.availableBets[0]);
    expect(session.getCreditsAmount()).toBe(1000);
};

const testSessionWithSpecifiedConfig = (sessionClass: any, configClass: any) => {
    const config: IGameSessionConfig = new configClass();
    config.availableBets = [10, 20, 30];
    config.creditsAmount = 5000;
    const session: IGameSession = new sessionClass(config);
    expect(session.isBetAvailable(1)).toBeFalsy();
    expect(session.isBetAvailable(10)).toBeTruthy();
    expect(session.getAvailableBets()).toEqual(config.availableBets);
    expect(session.getBet()).toBe(config.availableBets[0]);
    expect(session.getCreditsAmount()).toBe(5000);
};

const testSessionWithWrongInitialBet = (sessionClass: any, configClass: any) => {
    const config: IGameSessionConfig = new configClass();
    config.availableBets = [10, 20, 30];
    config.bet = 1;
    const session: IGameSession = new sessionClass(config);
    expect(session.getBet()).toBe(config.availableBets[0]);
};

const testPlayWhileEnoughCredits = (session: IGameSession) => {
    session.setBet(10);
    session.play();
    expect(session.getCreditsAmount()).toBe(990);
    expect(session.canPlayNextGame()).toBeTruthy();

    // Play with different bet
    session.setBet(100);
    session.play();
    expect(session.getCreditsAmount()).toBe(890);
    expect(session.canPlayNextGame()).toBeTruthy();

    let playedGamesNum: number = 0;
    let expectedGamesToPlay: number = Math.floor(session.getCreditsAmount() / session.getBet());
    while (session.canPlayNextGame()) {
        session.play();
        playedGamesNum++;
    }

    expect(playedGamesNum).toBe(expectedGamesToPlay);

    // Decrease bet to 10 and play remaining 9 games
    session.setBet(10);
    playedGamesNum = 0;
    expectedGamesToPlay = Math.floor(session.getCreditsAmount() / session.getBet());
    while (session.canPlayNextGame()) {
        session.play();
        playedGamesNum++;
    }

    expect(playedGamesNum).toBe(expectedGamesToPlay);
};

describe("GameSession", () => {
    const sessionClass = GameSession;
    const configClass = GameSessionConfig;

    it("creates default session", () => {
        testDefaultSession(sessionClass, configClass);
    });

    it("creates session with specified config", () => {
        testSessionWithSpecifiedConfig(sessionClass, configClass);
    });

    it("creates session with wrong initial bet", () => {
        testSessionWithWrongInitialBet(sessionClass, configClass);
    });

    it("plays while enough credits", () => {
        const config: IGameSessionConfig = new configClass();
        const session = new sessionClass(config);
        testPlayWhileEnoughCredits(session);
    });

});

export {
    testDefaultSession,
    testSessionWithSpecifiedConfig,
    testSessionWithWrongInitialBet,
};
