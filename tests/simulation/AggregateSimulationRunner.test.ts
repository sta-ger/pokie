import {AggregateSimulationRunner, GameSessionHandling} from "pokie";

function createBaseOnlySession(rounds: number): GameSessionHandling {
    let round = 0;
    return {
        getCreditsAmount: () => Number.MAX_SAFE_INTEGER,
        setCreditsAmount: () => undefined,
        getBet: () => 1,
        setBet: () => undefined,
        getAvailableBets: () => [1],
        canPlayNextGame: () => round < rounds,
        play: () => {
            round++;
        },
        getWinAmount: () => 0,
    } as unknown as GameSessionHandling;
}

// Round index r (0-indexed, the round about to be played) drives both getStakeAmount() and the
// outcome decided inside play(), so the two never disagree about which physical round they describe:
//   - r % 5 === 4  -> an unfinished free-games round (getStakeAmount() === 0), 10 of every 50 rounds.
//   - r % 10 === 0 -> a winning round (win 10); these never coincide with a freeGames round, so every
//                     win in this fixture lands in "base".
function createFreeGamesAwareSession(rounds: number): GameSessionHandling {
    let round = 0;
    let pendingWin = 0;
    return {
        getCreditsAmount: () => Number.MAX_SAFE_INTEGER,
        setCreditsAmount: () => undefined,
        getBet: () => 1,
        setBet: () => undefined,
        getAvailableBets: () => [1],
        canPlayNextGame: () => round < rounds,
        getStakeAmount: () => (round % 5 === 4 ? 0 : 1),
        play: () => {
            pendingWin = round % 10 === 0 ? 10 : 0;
            round++;
        },
        getWinAmount: () => pendingWin,
    } as unknown as GameSessionHandling;
}

describe("AggregateSimulationRunner breakdown", () => {
    test("getBreakdownStatistics returns undefined when the session doesn't support categorization", () => {
        const runner = new AggregateSimulationRunner(createBaseOnlySession(50), 50);

        runner.run();

        expect(runner.getBreakdownStatistics()).toBeUndefined();
    });

    test("getBreakdownStatistics is undefined before run() is called", () => {
        const runner = new AggregateSimulationRunner(createBaseOnlySession(50), 50);

        expect(runner.getBreakdownStatistics()).toBeUndefined();
    });

    test("splits rounds into base/freeGames categories using the default stake-based determiner", () => {
        const runner = new AggregateSimulationRunner(createFreeGamesAwareSession(50), 50);

        runner.run();
        const breakdown = runner.getBreakdownStatistics();

        expect(breakdown).toBeDefined();
        expect(breakdown!.base.rounds).toBe(40);
        expect(breakdown!.freeGames.rounds).toBe(10);
    });

    test("attributes bet/win/rtp/maxWin/hitFrequency correctly per category", () => {
        const runner = new AggregateSimulationRunner(createFreeGamesAwareSession(50), 50);

        runner.run();
        const breakdown = runner.getBreakdownStatistics()!;

        expect(breakdown.base.totalBet).toBe(40);
        expect(breakdown.base.totalWin).toBe(50);
        expect(breakdown.base.rtp).toBeCloseTo(50 / 40, 10);
        expect(breakdown.base.hitFrequency).toBeCloseTo(5 / 40, 10);
        expect(breakdown.base.maxWin).toBe(10);

        expect(breakdown.freeGames.totalBet).toBe(10);
        expect(breakdown.freeGames.totalWin).toBe(0);
        expect(breakdown.freeGames.rtp).toBe(0);
        expect(breakdown.freeGames.hitFrequency).toBe(0);
        expect(breakdown.freeGames.maxWin).toBe(0);
    });

    test("base + freeGames rounds/totalBet/totalWin add up to the overall accumulator totals", () => {
        const runner = new AggregateSimulationRunner(createFreeGamesAwareSession(50), 50);

        const statistics = runner.run().getStatistics();
        const breakdown = runner.getBreakdownStatistics()!;

        const summedRounds = breakdown.base.rounds + breakdown.freeGames.rounds;
        const summedBet = breakdown.base.totalBet + breakdown.freeGames.totalBet;
        const summedWin = breakdown.base.totalWin + breakdown.freeGames.totalWin;

        expect(summedRounds).toBe(statistics.rounds);
        expect(summedBet).toBe(statistics.totalBet);
        expect(summedWin).toBe(statistics.totalPayout);
    });

    test("a custom SimulationRoundCategoryDetermining can be injected instead of the default", () => {
        const customDeterminer = {
            supportsRoundCategorization: () => true,
            categorizeRound: () => "everythingIsBonus",
        };
        const runner = new AggregateSimulationRunner(createBaseOnlySession(10), 10, undefined, customDeterminer);

        runner.run();
        const breakdown = runner.getBreakdownStatistics();

        expect(Object.keys(breakdown!)).toEqual(["everythingIsBonus"]);
        expect(breakdown!.everythingIsBonus.rounds).toBe(10);
    });
});
