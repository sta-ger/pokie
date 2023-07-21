import {PlayUntilAnyLosingCombinationStrategy} from "pokie";
import {GameSessionReturnSpecifiedWinMock} from "./GameSessionReturnSpecifiedWinMock.js";

describe("PlayUntilAnyLosingCombinationStrategy", () => {
    test("canPlayNextGame", () => {
        const strategy = new PlayUntilAnyLosingCombinationStrategy();

        const winModel = {value: 0};
        const sessionMock = new GameSessionReturnSpecifiedWinMock(winModel);

        expect(strategy.canPlayNextSimulationRound(sessionMock)).toBeFalsy();
        winModel.value = 100;
        expect(strategy.canPlayNextSimulationRound(sessionMock)).toBeTruthy();
    });
});
