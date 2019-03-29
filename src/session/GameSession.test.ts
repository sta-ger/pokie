import {GameSession} from "./GameSession";
import {IGameSessionFlow} from "./flow/IGameSessionFlow";
import {GameSessionFlow} from "./flow/GameSessionFlow";
import {IGameSessionModel} from "./IGameSessionModel";
import {IGameSession} from "./IGameSession";

const createSessionModel = (): IGameSessionModel => {
    return {
        winning: 0,
        bet: 10,
        credits: 1000
    };
};

const createGameSession = (): IGameSession => {
    return new GameSession(new GameSessionFlow(), createSessionModel());
};

it("creates session with provided model", () => {
    const model: IGameSessionModel = createSessionModel();
    const session: IGameSession = createGameSession();
    expect(session.getBet()).toBe(model.bet);
    expect(session.getCreditsAmount()).toBe(model.credits);
    expect(session.getWinningAmount()).toBe(model.winning);
});

it("plays while enough credits", () => {
    const flow: IGameSessionFlow = new GameSessionFlow();
    const model: IGameSessionModel = {
        winning: 0,
        bet: 10,
        credits: 1000
    };
    const session = new GameSession(flow, model);
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