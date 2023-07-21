import {PlayFreeGamesStrategy, VideoSlotWithFreeGamesSessionHandling} from "pokie";

describe("PlayFreeGamesStrategy", () => {
    test("canPlayNextGame", () => {
        let strategy: PlayFreeGamesStrategy;

        strategy = new PlayFreeGamesStrategy();
        expect(
            strategy.canPlayNextSimulationRound({
                getWonFreeGamesNumber: () => 0,
            } as unknown as VideoSlotWithFreeGamesSessionHandling),
        ).toBeTruthy();

        strategy = new PlayFreeGamesStrategy();
        expect(
            strategy.canPlayNextSimulationRound({
                getWonFreeGamesNumber: () => undefined,
            } as unknown as VideoSlotWithFreeGamesSessionHandling),
        ).toBeTruthy();

        strategy = new PlayFreeGamesStrategy();
        expect(
            strategy.canPlayNextSimulationRound({
                getWonFreeGamesNumber: () => 10,
            } as unknown as VideoSlotWithFreeGamesSessionHandling),
        ).toBeFalsy();

        strategy = new PlayFreeGamesStrategy();
        strategy.setExactNumberOfFreeGames(20);
        expect(
            strategy.canPlayNextSimulationRound({
                getWonFreeGamesNumber: () => 10,
            } as unknown as VideoSlotWithFreeGamesSessionHandling),
        ).toBeTruthy();

        strategy = new PlayFreeGamesStrategy();
        strategy.setExactNumberOfFreeGames(20);
        expect(
            strategy.canPlayNextSimulationRound({
                getWonFreeGamesNumber: () => 20,
            } as unknown as VideoSlotWithFreeGamesSessionHandling),
        ).toBeFalsy();

        strategy = new PlayFreeGamesStrategy();
        strategy.setLastFreeGame(true);
        expect(
            strategy.canPlayNextSimulationRound({
                getFreeGamesBank: () => 100,
                getFreeGamesNum: () => 1,
                getFreeGamesSum: () => 20,
            } as unknown as VideoSlotWithFreeGamesSessionHandling),
        ).toBeTruthy();

        strategy = new PlayFreeGamesStrategy();
        strategy.setLastFreeGame(true);
        expect(
            strategy.canPlayNextSimulationRound({
                getFreeGamesBank: () => 100,
                getFreeGamesNum: () => 20,
                getFreeGamesSum: () => 20,
            } as unknown as VideoSlotWithFreeGamesSessionHandling),
        ).toBeFalsy();

        strategy = new PlayFreeGamesStrategy();
        strategy.setLastFreeGame(true);
        strategy.setShouldHaveFreeBankAtEnd(true);
        expect(
            strategy.canPlayNextSimulationRound({
                getFreeGamesBank: () => 0,
                getFreeGamesNum: () => 20,
                getFreeGamesSum: () => 20,
            } as unknown as VideoSlotWithFreeGamesSessionHandling),
        ).toBeTruthy();

        strategy = new PlayFreeGamesStrategy();
        strategy.setLastFreeGame(true);
        strategy.setShouldHaveFreeBankAtEnd(true);
        expect(
            strategy.canPlayNextSimulationRound({
                getFreeGamesBank: () => 100,
                getFreeGamesNum: () => 20,
                getFreeGamesSum: () => 20,
            } as unknown as VideoSlotWithFreeGamesSessionHandling),
        ).toBeFalsy();

        strategy = new PlayFreeGamesStrategy();
        strategy.setLastFreeGame(true);
        strategy.setShouldHaveFreeBankAtEnd(false);
        expect(
            strategy.canPlayNextSimulationRound({
                getFreeGamesBank: () => 0,
                getFreeGamesNum: () => 20,
                getFreeGamesSum: () => 20,
            } as unknown as VideoSlotWithFreeGamesSessionHandling),
        ).toBeFalsy();

        strategy = new PlayFreeGamesStrategy();
        strategy.setLastFreeGame(true);
        strategy.setShouldHaveFreeBankAtEnd(false);
        expect(
            strategy.canPlayNextSimulationRound({
                getFreeGamesBank: () => 100,
                getFreeGamesNum: () => 20,
                getFreeGamesSum: () => 20,
            } as unknown as VideoSlotWithFreeGamesSessionHandling),
        ).toBeTruthy();
    });
});
