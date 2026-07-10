import {VideoSlotSessionHandling, VideoSlotConfigRepresenting} from "pokie";

export const testDefaultVideoSlotSessionHasProperInitialValues = (
    session: VideoSlotSessionHandling,
    config: VideoSlotConfigRepresenting,
): void => {
    expect(session.getWinAmount()).toEqual(0);
    expect(session.getPaytable()).toEqual(config.getPaytable());
    expect(session.getSymbolsSequences().length).toEqual(config.getSymbolsSequences().length);
    expect(session.getReelsSymbolsNumber()).toEqual(config.getReelsSymbolsNumber());
    expect(session.getReelsNumber()).toEqual(config.getReelsNumber());
    expect(session.getAvailableSymbols()).toEqual(config.getAvailableSymbols());
    expect(session.getSymbolsCombination().toMatrix().length).toEqual(config.getReelsNumber());
    expect(session.getSymbolsCombination().getSymbols(0)).toHaveLength(config.getReelsSymbolsNumber());
    expect(Object.keys(session.getWinningLines()).length).toEqual(0);
    expect(Object.keys(session.getWinningScatters()).length).toEqual(0);
};

export const testInsufficientCreditsBlocksPlay = (session: VideoSlotSessionHandling): void => {
    session.setCreditsAmount(session.getBet() - 1); // balance below the bet
    expect(session.canPlayNextGame()).toBe(false);

    const creditsBefore = session.getCreditsAmount();
    const combinationBefore = session.getSymbolsCombination();
    const winAmountBefore = session.getWinAmount();

    session.play();

    expect(session.getCreditsAmount()).toEqual(creditsBefore); // stake was never deducted
    expect(session.getSymbolsCombination()).toBe(combinationBefore); // no new screen was generated
    expect(session.getWinAmount()).toEqual(winAmountBefore); // no win was computed or paid out
    expect(Object.keys(session.getWinningLines()).length).toEqual(0);
    expect(Object.keys(session.getWinningScatters()).length).toEqual(0);
};

export const testZeroStakePlaysRegardlessOfCredits = (session: VideoSlotSessionHandling): void => {
    session.setCreditsAmount(0);
    expect(session.getBet()).toEqual(0);
    expect(session.canPlayNextGame()).toBe(true); // 0 credits is still >= a 0 bet

    const combinationBefore = session.getSymbolsCombination();

    session.play();

    expect(session.getSymbolsCombination()).not.toBe(combinationBefore); // a real round was played
    expect(session.getCreditsAmount()).toEqual(session.getWinAmount()); // 0 stake deducted, only a win (if any) added
};

export const testPlayUntilWin = (session: VideoSlotSessionHandling, config: VideoSlotConfigRepresenting): void => {
    let lastBet = 0;
    let lastCredits = 0;
    let wasLinesWin = false;
    let wasScattersWin = false;

    const timesToPlay = 1000;
    for (let i = 0; i < timesToPlay; i++) {
        while (session.getWinAmount() === 0 || wasLinesWin || wasScattersWin) {
            wasLinesWin = false;
            wasScattersWin = false;
            session.setCreditsAmount(1000);
            lastCredits = session.getCreditsAmount();
            lastBet = session.getBet();
            session.play();
            if (session.getWinAmount() === 0) {
                expect(session.getCreditsAmount()).toEqual(lastCredits - lastBet);
            } else if (!session.canPlayNextGame()) {
                session.setCreditsAmount(Infinity);
            }
        }
        expect(session.getCreditsAmount()).toBeGreaterThanOrEqual(lastCredits - lastBet);

        wasLinesWin = Object.keys(session.getWinningLines()).length > 0;
        if (wasLinesWin) {
            Object.values(session.getWinningLines()).forEach((lineModel) => {
                expect(lineModel.getDefinition()).toEqual(
                    config.getLinesDefinitions().getLineDefinition(lineModel.getLineId()),
                );
            });
        }
        wasScattersWin = Object.keys(session.getWinningScatters()).length > 0;
        if (i === timesToPlay - 1 && !wasLinesWin && !wasScattersWin) {
            i = 0;
        }
    }
};
