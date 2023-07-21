import {
    SymbolsSequence,
    VideoSlotWithFreeGamesConfig,
    VideoSlotWithFreeGamesSessionHandling,
    VideoSlotWithFreeGamesConfigRepresenting,
} from "pokie";

export const testDefaultVideoSlotWithFreeGamesSession = (session: VideoSlotWithFreeGamesSessionHandling): void => {
    expect(session.getFreeGamesNum()).toBe(0);
    expect(session.getFreeGamesSum()).toBe(0);
    expect(session.getFreeGamesBank()).toBe(0);
};

export const testFreeGamesGettersSetters = (session: VideoSlotWithFreeGamesSessionHandling): void => {
    session.setFreeGamesBank(100);
    session.setFreeGamesNum(5);
    session.setFreeGamesSum(10);
    expect(session.getFreeGamesSum()).toBe(10);
    expect(session.getFreeGamesNum()).toBe(5);
    expect(session.getFreeGamesBank()).toBe(100);
};

export const testPlayUntilWinFreeGames = (session: VideoSlotWithFreeGamesSessionHandling): void => {
    while (session.getFreeGamesSum() === 0) {
        session.setCreditsAmount(Number.MIN_SAFE_INTEGER);
        session.play();
    }
    expect(session.getFreeGamesNum()).toBe(0);
    expect(session.getFreeGamesSum()).toBeGreaterThan(0);
};

export const testPlayFreeGames = (
    session: VideoSlotWithFreeGamesSessionHandling,
    conf: VideoSlotWithFreeGamesConfigRepresenting,
): void => {
    let wasNormalFreeGames = false; // played normal 10 free games
    let wasAdditionalFreeGames = false; // free games was won again at free games mode
    let wasAdditionalFreeGamesWonAtLastFreeGame = false; // additional free games was won at 10 of 10 free games
    let wasFreeBank = false; // was any winning during free games mode
    let wasNoFreeBank = false; // was no winnings during free games mode

    while (
        !wasNormalFreeGames ||
        !wasAdditionalFreeGames ||
        !wasAdditionalFreeGamesWonAtLastFreeGame ||
        !wasFreeBank ||
        !wasNoFreeBank
    ) {
        while (
            session.getFreeGamesSum() === 0 ||
            (session.getFreeGamesSum() > 0 && session.getFreeGamesNum() === session.getFreeGamesSum())
        ) {
            // Play until won free games
            session.setCreditsAmount(10000);
            session.play();
        }

        let playedFreeGamesCount = 0;
        let expectedPlayedFreeGamesCount = session.getFreeGamesSum();
        let lastFreeBank = 0;
        let lastFreeGamesSum;
        const creditsBeforeFreeGame = session.getCreditsAmount();

        while (session.getFreeGamesSum() > 0 && session.getFreeGamesNum() !== session.getFreeGamesSum()) {
            // Play until end of free games
            lastFreeBank = session.getFreeGamesBank();
            lastFreeGamesSum = session.getFreeGamesSum();
            session.play();

            if (session.getFreeGamesSum() > lastFreeGamesSum && session.getFreeGamesNum() === lastFreeGamesSum) {
                wasAdditionalFreeGamesWonAtLastFreeGame = true;
            }

            expect(session.getFreeGamesBank()).toBe(lastFreeBank + session.getWinAmount());

            if (
                session.getFreeGamesNum() < session.getFreeGamesSum() ||
                session.getFreeGamesSum() > expectedPlayedFreeGamesCount
            ) {
                expect(session.getCreditsAmount()).toBe(creditsBeforeFreeGame); // Bet should not be subtracted at free games mode
            } else {
                expect(session.getCreditsAmount()).toBe(creditsBeforeFreeGame + session.getFreeGamesBank());
            }

            playedFreeGamesCount++;

            if (session.getFreeGamesSum() > expectedPlayedFreeGamesCount) {
                wasAdditionalFreeGames = true;
                expectedPlayedFreeGamesCount = session.getFreeGamesSum();
                expect(Object.keys(session.getWinningScatters()).length).toBeGreaterThan(0);

                conf.getScatterSymbols().forEach((scatter) => {
                    if (conf.getFreeGamesForScatters(scatter, 3) > 0) {
                        expect(Reflect.has(session.getWinningScatters(), scatter)).toBe(true);
                        expect(
                            conf.getFreeGamesForScatters(
                                scatter,
                                session.getWinningScatters()[scatter].getSymbolsPositions().length,
                            ),
                        ).toBeGreaterThan(0);
                        expect(session.getWonFreeGamesNumber()).toBe(
                            conf.getFreeGamesForScatters(
                                scatter,
                                session.getWinningScatters()[scatter].getSymbolsPositions().length,
                            ),
                        );
                    }
                });
            } else {
                wasNormalFreeGames = true;
            }
        }

        if (lastFreeBank === 0) {
            wasNoFreeBank = true;
        } else {
            wasFreeBank = true;
        }

        expect(playedFreeGamesCount).toBe(expectedPlayedFreeGamesCount);
    }
};

export const createConfigForTestPlayFreeGames = (): VideoSlotWithFreeGamesConfigRepresenting => {
    const conf = new VideoSlotWithFreeGamesConfig();
    const sequences = new Array(conf.getReelsNumber())
        .fill(0)
        .map(() => new SymbolsSequence().fromNumberOfEachSymbol(conf.getAvailableSymbols(), 1));
    sequences[0].fromArray(sequences[0].toArray().filter((symbol) => symbol !== "S"));
    sequences[4].fromArray(sequences[0].toArray().filter((symbol) => symbol !== "S"));
    conf.setSymbolsSequences(sequences);
    return conf;
};
