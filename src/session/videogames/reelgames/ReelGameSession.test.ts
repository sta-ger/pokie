import {ReelGameSession} from "./ReelGameSession";
import {ReelGameSessionConfig} from "./ReelGameSessionConfig";
import {IReelGameSession} from "./IReelGameSession";
import {IReelGameSessionConfig} from "./IReelGameSessionConfig";
import {ReelGameSessionReelsController} from "./reelscontroller/ReelGameSessionReelsController";
import {ReelGameSessionWinCalculator} from "./wincalculator/ReelGameSessionWinCalculator";
import {
    testDefaultSession,
    testSessionWithSpecifiedConfig,
    testSessionWithWrongInitialBet,
} from "../../GameSession.test";

const testDefaultReelGameSession = (sessionClass: any, configClass: any) => {
    const config: IReelGameSessionConfig = new configClass();
    const session: IReelGameSession = new sessionClass(
        config,
        new ReelGameSessionReelsController(config),
        new ReelGameSessionWinCalculator(config),
    );
    expect(session.getWinningAmount()).toEqual(0);
    expect(session.getPaytable()).toEqual(config.paytable[session.getBet()]);
    expect(session.getReelsItemsSequences().length).toEqual(config.reelsItemsSequences.length);
    expect(session.getReelsItemsNumber()).toEqual(config.reelsItemsNumber);
    expect(session.getReelsNumber()).toEqual(config.reelsNumber);
    expect(session.getReelsItems()).toEqual([]);
    expect(session.getWinningLines()).toEqual({});
    expect(session.getWinningScatters()).toEqual({});
};

const testPlayUntilWin = (sessionClass: any, configClass: any) => {
    let lastBet: number = 0;
    let lastCredits: number = 0;
    let wasLinesWin: boolean = false;
    let wasScattersWin: boolean = false;

    const config: IReelGameSessionConfig = new configClass();
    config.creditsAmount = 10000000;
    const session: IReelGameSession = new sessionClass(
        config,
        new ReelGameSessionReelsController(config),
        new ReelGameSessionWinCalculator(config),
    );

    const timesToPlay: number = 1000;
    for (let i: number = 0; i < timesToPlay; i++) {
        while (session.getWinningAmount() === 0 || wasLinesWin || wasScattersWin) {
            wasLinesWin = false;
            wasScattersWin = false;
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
};

describe("ReelGameSession", () => {
    const sessionClass = ReelGameSession;
    const configClass = ReelGameSessionConfig;

    it("pass base tests", () => {
        testDefaultSession(sessionClass, configClass);
        testSessionWithSpecifiedConfig(sessionClass, configClass);
        testSessionWithWrongInitialBet(sessionClass, configClass);
    });

    it("creates default reel game session", () => {
        testDefaultReelGameSession(sessionClass, configClass);
    });

    it("should several times play until any winning", () => {
        testPlayUntilWin(sessionClass, configClass);
    });

});

export {
    testDefaultReelGameSession,
    testPlayUntilWin,
};
