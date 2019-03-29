import {createSessionModel} from "../../GameSession.test";
import {IGameSessionModel} from "../../IGameSessionModel";
import {IGameSession} from "../../IGameSession";
import {ReelGameSessionFlow} from "./flow/ReelGameSessionFlow";
import {ReelGameSession} from "./ReelGameSession";

export const createReelGameSession = (model?: IGameSessionModel): IGameSession => {
    return new ReelGameSession(new ReelGameSessionFlow(), model ? model : createSessionModel());
};

describe("ReelGameSession", () => {

    it("creates reel game session with provided model", () => {
        const model: IGameSessionModel = createSessionModel();
        const session: IGameSession = createReelGameSession();
        expect(session.getBet()).toBe(model.bet);
        expect(session.getCreditsAmount()).toBe(model.credits);
        expect(session.getWinningAmount()).toBe(model.winning);
    });

    it("should play until any winning", () => {
        const model = createSessionModel();
        model.credits = Infinity;
        const session = createReelGameSession(model);

        let lastBet: number;
        let lastCredits: number;
        while (session.getWinningAmount() === 0) {
            lastCredits = session.getCreditsAmount();
            lastBet = session.getBet();
            session.play();
            if (session.getWinningAmount() === 0) {
                expect(session.getCreditsAmount()).toBe(lastCredits - lastBet);
            }
        }

        expect(session.getCreditsAmount()).toBeGreaterThan(lastCredits - lastBet);

    });

});
