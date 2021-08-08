import {IGameSession} from "../session/IGameSession";
import {GameSessionSimulationModel} from "./GameSessionSimulationModel";

describe("GameSessionSimulationModel", () => {

    // noinspection DuplicatedCode
    it("computes session values properly", () => {
        const sessionMock = {
            getBet(): number {
                return 10;
            },
            getWinningAmount(): number {
                return 100;
            }
        } as unknown as IGameSession;
        const model = new GameSessionSimulationModel(sessionMock);
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
    });

});
