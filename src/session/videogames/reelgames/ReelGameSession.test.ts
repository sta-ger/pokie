import {ReelGameSession} from "./ReelGameSession";
import {ReelGameSessionConfig} from "./ReelGameSessionConfig";
import {IReelGameSession} from "./IReelGameSession";
import {IReelGameSessionConfig} from "./IReelGameSessionConfig";
import {ReelGameSessionReelsController} from "./reelscontroller/ReelGameSessionReelsController";
import {ReelGameSessionWinCalculator} from "./wincalculator/ReelGameSessionWinCalculator";

describe("ReelGameSession", () => {

    it("creates default reel game session", () => {
        const config: IReelGameSessionConfig = new ReelGameSessionConfig();
        const session: IReelGameSession = new ReelGameSession(config, new ReelGameSessionReelsController(config), new ReelGameSessionWinCalculator(config));
        expect(session.getAvailableBets()).toEqual(config.availableBets);
        expect(session.getBet()).toEqual(config.availableBets[0]);
        expect(session.getCreditsAmount()).toEqual(1000);
        expect(session.getWinningAmount()).toEqual(0);


        expect(session.getPaytable()).toEqual(config.paytable[session.getBet()]);
        expect(session.getReelsItemsSequences().length).toEqual(config.reelsItemsSequences.length);
        expect(session.getReelsItemsNumber()).toEqual(config.reelsItemsNumber);
        expect(session.getReelsNumber()).toEqual(config.reelsNumber);

        expect(session.getReelsItems()).not.toBeDefined();
        expect(session.getWinningLines()).not.toBeDefined();
        expect(session.getWinningScatters()).not.toBeDefined();
    });

    /*it("should play until any winning", () => {
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
                expect(session.getCreditsAmount()).toEqual(lastCredits - lastBet);
            }
        }

        expect(session.getCreditsAmount()).toEqualGreaterThan(lastCredits - lastBet);

    });*/

});
