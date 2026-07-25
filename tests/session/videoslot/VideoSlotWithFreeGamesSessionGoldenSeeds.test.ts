import {
    SeededRandomNumberGenerator,
    SymbolsCombinationsGenerator,
    VideoSlotWinCalculator,
    VideoSlotWithFreeGamesConfig,
    VideoSlotWithFreeGamesSession,
} from "pokie";
import {goldenVideoSlotSymbolsSequences} from "./VideoSlotGoldenTestFixtures.js";

// Pins the exact state-transition sequence a known seed produces: a base spin that triggers free games,
// each free spin banking its win instead of paying it out, the bank being paid to credits on the free
// spin that completes the round, and the very next spin resetting back to normal play. The existing
// DefaultVideoSlotWithFreeGamesSessionTestCases assert only the *shape* of these transitions (e.g. "num
// becomes sum", "credits are restored") using play-until-some-condition loops with whatever seed
// Math.random() happens to produce; this locks the exact screens/wins/credits/free-game counters a
// specific seed produces at every step, so a change to trigger, banking, or reset logic that still
// satisfies those shape assertions but alters actual behavior gets caught.
describe("VideoSlotWithFreeGamesSession golden seed 313", () => {
    function buildSession(): VideoSlotWithFreeGamesSession {
        const config = new VideoSlotWithFreeGamesConfig();
        config.setSymbolsSequences(goldenVideoSlotSymbolsSequences());
        const combinationsGenerator = new SymbolsCombinationsGenerator(config, new SeededRandomNumberGenerator(313));
        const winCalculator = new VideoSlotWinCalculator(config);
        const session = new VideoSlotWithFreeGamesSession(config, combinationsGenerator, winCalculator);
        session.setBet(config.getAvailableBets()[0]);
        session.setCreditsAmount(1000);
        return session;
    }

    function stateAfterPlay(session: VideoSlotWithFreeGamesSession) {
        return {
            screen: session.getSymbolsCombination().toMatrix(),
            win: session.getWinAmount(),
            credits: session.getCreditsAmount(),
            freeGamesNum: session.getFreeGamesNum(),
            freeGamesSum: session.getFreeGamesSum(),
            freeGamesBank: session.getFreeGamesBank(),
        };
    }

    test("the trigger spin awards 10 free games and banks nothing yet", () => {
        const session = buildSession();

        session.play();

        expect(stateAfterPlay(session)).toEqual({
            screen: [
                ["10", "A", "S"],
                ["Q", "J", "K"],
                ["9", "S", "A"],
                ["9", "S", "K"],
                ["A", "J", "10"],
            ],
            win: 1,
            credits: 1000,
            freeGamesNum: 0,
            freeGamesSum: 10,
            freeGamesBank: 0,
        });
    });

    test("all 10 free spins play out exactly, banking wins instead of paying them, then pay the bank out on the last one", () => {
        const session = buildSession();
        session.play(); // trigger spin

        const expectedFreeSpins = [
            {win: 0, credits: 1000, freeGamesNum: 1, freeGamesBank: 0},
            {win: 1, credits: 1000, freeGamesNum: 2, freeGamesBank: 1},
            {win: 0, credits: 1000, freeGamesNum: 3, freeGamesBank: 1},
            {win: 0, credits: 1000, freeGamesNum: 4, freeGamesBank: 1},
            {win: 0, credits: 1000, freeGamesNum: 5, freeGamesBank: 1},
            {win: 0, credits: 1000, freeGamesNum: 6, freeGamesBank: 1},
            {win: 0, credits: 1000, freeGamesNum: 7, freeGamesBank: 1},
            {win: 0, credits: 1000, freeGamesNum: 8, freeGamesBank: 1},
            {win: 0, credits: 1000, freeGamesNum: 9, freeGamesBank: 1},
            {win: 0, credits: 1001, freeGamesNum: 10, freeGamesBank: 1}, // bank paid out to credits here
        ];

        for (const expected of expectedFreeSpins) {
            session.play();
            expect({
                win: session.getWinAmount(),
                credits: session.getCreditsAmount(),
                freeGamesNum: session.getFreeGamesNum(),
                freeGamesBank: session.getFreeGamesBank(),
            }).toEqual(expected);
            expect(session.getFreeGamesSum()).toBe(10); // never retriggers for this seed
        }

        expect(session.canPlayNextGame()).toBe(true); // free round is "finished" (num === sum), base session also playable

        // the next spin is a normal paid spin: free-games counters reset back to zero first
        session.play();

        expect(stateAfterPlay(session)).toEqual({
            screen: [
                ["A", "S", "K"],
                ["A", "9", "Q"],
                ["K", "J", "Q"],
                ["Q", "10", "9"],
                ["10", "9", "S"],
            ],
            win: 0,
            credits: 1000, // bet charged again, against the real balance topped up by the free-games payout
            freeGamesNum: 0,
            freeGamesSum: 0,
            freeGamesBank: 0,
        });
    });
});
