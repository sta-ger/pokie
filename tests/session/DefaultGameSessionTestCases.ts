import {GameSessionConfig, GameSessionHandling, GameSessionConfigRepresenting} from "pokie";

export const testDefaultSessionHasProperInitialValues = (
    session: GameSessionHandling,
    config: GameSessionConfigRepresenting,
): void => {
    expect(session.getAvailableBets()).toEqual(config.getAvailableBets());
    expect(session.getBet()).toEqual(config.getAvailableBets()[0]);
    expect(session.getCreditsAmount()).toEqual(1000);
    expect(session.getWinAmount()).toEqual(0);
};

export const createCustomConfigForTestProperInitialValues = (): GameSessionConfigRepresenting => {
    const c = new GameSessionConfig();
    c.setAvailableBets([10, 20, 30]);
    c.setCreditsAmount(5000);
    return c;
};

export const testDefaultSessionHasProperInitialValuesWithCustomConfig = (
    session: GameSessionHandling,
    config: GameSessionConfigRepresenting,
): void => {
    expect(config.isBetAvailable(1)).toBeFalsy();
    expect(config.isBetAvailable(10)).toBeTruthy();
    expect(session.getAvailableBets()).toEqual(config.getAvailableBets());
    expect(session.getBet()).toEqual(config.getAvailableBets()[0]);
    expect(session.getCreditsAmount()).toEqual(config.getCreditsAmount());
};

export const createCustomConfigForWrongBetTest = (): GameSessionConfigRepresenting => {
    const c = new GameSessionConfig();
    c.setAvailableBets([10, 20, 30]);
    return c;
};

export const testDefaultSessionWithWrongInitialBet = (
    session: GameSessionHandling,
    config: GameSessionConfigRepresenting,
): void => {
    let bet = config.getAvailableBets()[0];
    while (config.isBetAvailable(bet)) {
        bet = Math.floor(Math.random() * Math.floor(Number.MAX_SAFE_INTEGER));
    }
    session.setBet(bet);
    expect(session.getBet()).toEqual(config.getAvailableBets()[0]);
};

export const testDefaultSessionPlaysWhileEnoughCredits = (session: GameSessionHandling): void => {
    session.setBet(10);
    session.play();
    expect(session.getCreditsAmount()).toEqual(990);
    expect(session.canPlayNextGame()).toBeTruthy();

    session.setBet(100);
    session.play();
    expect(session.getCreditsAmount()).toEqual(890);
    expect(session.canPlayNextGame()).toBeTruthy();

    let playedGamesNum = 0;
    const expectedGamesToPlay = Math.floor(session.getCreditsAmount() / session.getBet());
    while (session.canPlayNextGame()) {
        session.play();
        playedGamesNum++;
    }

    expect(playedGamesNum).toEqual(expectedGamesToPlay);

    session.setBet(10);
    playedGamesNum = 0;
    const remainingGamesToPlay = Math.floor(session.getCreditsAmount() / session.getBet());
    while (session.canPlayNextGame()) {
        session.play();
        playedGamesNum++;
    }

    expect(playedGamesNum).toEqual(remainingGamesToPlay);
};
