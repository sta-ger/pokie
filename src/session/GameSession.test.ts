import {GameSession} from "./GameSession";
import {IGameSession} from "./IGameSession";
import {GameSessionConfig} from "./GameSessionConfig";
import {IGameSessionConfig} from "./IGameSessionConfig";

describe("GameSession", () => {
    it("creates default session", () => {
        const config: IGameSessionConfig = new GameSessionConfig();
        const session: IGameSession = new GameSession(config);
        expect(session.getAvailableBets()).toEqual(config.availableBets);
        expect(session.getBet()).toBe(config.availableBets[0]);
        expect(session.getCreditsAmount()).toBe(1000);
    });

    it("creates session with specified config", () => {
        const config: IGameSessionConfig = new GameSessionConfig();
        config.availableBets = [10, 20, 30];
        config.creditsAmount = 5000;
        const session: IGameSession = new GameSession(config);
        expect(session.isBetAvailable(1)).toBeFalsy();
        expect(session.isBetAvailable(10)).toBeTruthy();
        expect(session.getAvailableBets()).toEqual(config.availableBets);
        expect(session.getBet()).toBe(config.availableBets[0]);
        expect(session.getCreditsAmount()).toBe(5000);
    });

    it("creates session with wrong initial bet", () => {
        const config: IGameSessionConfig = new GameSessionConfig();
        config.availableBets = [10, 20, 30];
        config.bet = 1;
        const session: IGameSession = new GameSession(config);
        expect(session.getBet()).toBe(config.availableBets[0]);
    });

    it("plays while enough credits", () => {
        const config: IGameSessionConfig = new GameSessionConfig();
        const session = new GameSession(config);
        session.setBet(10);
        session.play();
        expect(session.getCreditsAmount()).toBe(990);
        expect(session.canPlayNextGame()).toBeTruthy();

        //Play with different bet
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

        //Decrease bet to 10 and play remaining 9 games
        session.setBet(10);
        playedGamesNum = 0;
        expectedGamesToPlay = Math.floor(session.getCreditsAmount() / session.getBet());
        while (session.canPlayNextGame()) {
            session.play();
            playedGamesNum++;
        }

        expect(playedGamesNum).toBe(expectedGamesToPlay);
    });

});