import {IReelGameWithFreeGamesSession} from "../session/videogames/reelgames/IReelGameWithFreeGamesSession";
import {ReelGameWithFreeGamesSessionSimulationModel} from "./ReelGameWithFreeGamesSessionSimulationModel";

describe("ReelGameWithFreeGamesSessionSimulationModel", () => {

    // noinspection DuplicatedCode
    it("computes session values properly", () => {
        let fg = false;
        const sessionMock = {
            getBet(): number {
                return 10;
            },
            getWinningAmount(): number {
                return 100;
            },
            getFreeGameSum(): number {
                return fg ? 10 : 0;
            }
        } as unknown as IReelGameWithFreeGamesSession;
        const model = new ReelGameWithFreeGamesSessionSimulationModel(sessionMock);
        expect(model.getTotalBetAmount()).toBe(0);
        expect(model.getTotalReturnAmount()).toBe(0);
        expect(model.getRtp()).toBe(0);

        model.updateTotalBetBeforePlay();
        model.updateTotalReturnAfterPlay();

        expect(model.getTotalBetAmount()).toBe(sessionMock.getBet());
        expect(model.getTotalReturnAmount()).toBe(sessionMock.getWinningAmount());
        expect(model.getRtp()).toBe(model.getTotalReturnAmount() / model.getTotalBetAmount());

        model.updateTotalBetBeforePlay();
        model.updateTotalReturnAfterPlay();

        expect(model.getTotalBetAmount()).toBe(sessionMock.getBet() * 2);
        expect(model.getTotalReturnAmount()).toBe(sessionMock.getWinningAmount() * 2);
        expect(model.getRtp()).toBe(model.getTotalReturnAmount() / model.getTotalBetAmount());

        fg = true;

        model.updateTotalBetBeforePlay();
        model.updateTotalReturnAfterPlay();

        expect(model.getTotalBetAmount()).toBe(sessionMock.getBet() * 2);
        expect(model.getTotalReturnAmount()).toBe(sessionMock.getWinningAmount() * 3);
        expect(model.getRtp()).toBe(model.getTotalReturnAmount() / model.getTotalBetAmount());

        fg = false;

        model.updateTotalBetBeforePlay();
        model.updateTotalReturnAfterPlay();

        expect(model.getTotalBetAmount()).toBe(sessionMock.getBet() * 3);
        expect(model.getTotalReturnAmount()).toBe(sessionMock.getWinningAmount() * 4);
        expect(model.getRtp()).toBe(model.getTotalReturnAmount() / model.getTotalBetAmount());
    });

});
