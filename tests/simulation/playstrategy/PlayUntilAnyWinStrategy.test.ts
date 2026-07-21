import {PlayUntilAnyWinStrategy} from "../../../src/simulation/playstrategy/PlayUntilAnyWinStrategy.js";
import {GameSessionReturnSpecifiedWinMock} from "./GameSessionReturnSpecifiedWinMock.js";

describe("PlayUntilAnyWinStrategy", () => {
    test("can play next game", () => {
        const strategy = new PlayUntilAnyWinStrategy();

        const winModel = {value: 0};
        const sessionMock = new GameSessionReturnSpecifiedWinMock(winModel);

        expect(strategy.canPlayNextSimulationRound(sessionMock)).toBe(true);
        winModel.value = 100;
        expect(strategy.canPlayNextSimulationRound(sessionMock)).toBe(false);
    });
});
