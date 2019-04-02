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

    it("should several times play until any winning", () => {
        const config: IReelGameSessionConfig = new ReelGameSessionConfig();
        config.creditsAmount = 10000000;
        const session: IReelGameSession = new ReelGameSession(config, new ReelGameSessionReelsController(config), new ReelGameSessionWinCalculator(config));

        let lastBet: number;
        let lastCredits: number;
        let wasLinesWin: boolean;
        let wasScattersWin: boolean;
        const timesToPlay: number = 100;
        for (let i: number = 0; i < timesToPlay; i++) {
            while (session.getWinningAmount() === 0) {
                lastCredits = session.getCreditsAmount();
                lastBet = session.getBet();
                session.play();
                if (session.getWinningAmount() === 0) {
                    expect(session.getCreditsAmount()).toEqual(lastCredits - lastBet);
                }
            }
            expect(session.getCreditsAmount()).toBeGreaterThanOrEqual(lastCredits - lastBet);

            wasLinesWin = Object.keys(session.getWinningLines()).length > 0;
            wasScattersWin = Object.keys(session.getWinningScatters()).length > 0;
            if (i === timesToPlay - 1 && !wasLinesWin && !wasScattersWin) {
                i = 0;
            }
        }

    });

});
