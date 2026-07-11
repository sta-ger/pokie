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

    describe("explicit SimulationCategoryDetermining (default determiner composition)", () => {
        // Round index r (0-indexed) drives everything, same trick as createFreeGamesAwareSession above:
        //   - r < 3  -> explicitly declared "bonus" (a custom category no stake-based inference knows about)
        //   - r >= 3 -> the session stops declaring a category at all, and doesn't implement
        //               StakeAmountDetermining either — proves the explicit contract is genuinely optional
        //               per-round: those rounds still play normally and count toward the overall totals,
        //               they just aren't attributed to any breakdown category (no determiner supports them).
        function createExplicitCategorySession(rounds: number): GameSessionHandling {
            let round = 0;
            let pendingWin = 0;
            return {
                getCreditsAmount: () => Number.MAX_SAFE_INTEGER,
                setCreditsAmount: () => undefined,
                getBet: () => 1,
                setBet: () => undefined,
                getAvailableBets: () => [1],
                canPlayNextGame: () => round < rounds,
                getSimulationCategory: () => (round < 3 ? "bonus" : ""),
                play: () => {
                    pendingWin = round === 0 ? 7 : 0;
                    round++;
                },
                getWinAmount: () => pendingWin,
            } as unknown as GameSessionHandling;
        }

        test("uses the session's explicit category without any custom determiner being injected", () => {
            const runner = new AggregateSimulationRunner(createExplicitCategorySession(10), 10);

            const statistics = runner.run().getStatistics();
            const breakdown = runner.getBreakdownStatistics();

            expect(breakdown).toBeDefined();
            expect(Object.keys(breakdown!)).toEqual(["bonus"]);
            expect(breakdown!.bonus.rounds).toBe(3);
            expect(breakdown!.bonus.totalWin).toBe(7);
            // The other 7 rounds still played and count toward overall totals — they're just outside
            // any breakdown category since nothing in the default chain supports them.
            expect(statistics.rounds).toBe(10);
        });

        // A session can implement BOTH the explicit contract and StakeAmountDetermining — explicit wins
        // whenever it returns a valid category; stake-based inference only decides rounds the explicit
        // contract has no opinion on (returns "" for).
        function createExplicitWithStakeFallbackSession(rounds: number): GameSessionHandling {
            let round = 0;
            return {
                getCreditsAmount: () => Number.MAX_SAFE_INTEGER,
                setCreditsAmount: () => undefined,
                getBet: () => 1,
                setBet: () => undefined,
                getAvailableBets: () => [1],
                canPlayNextGame: () => round < rounds,
                // Explicit "bonus" only on round 0; every other round falls through to stake-based, which
                // reports "freeGames" on round 1 and "base" on round 2.
                getSimulationCategory: () => (round === 0 ? "bonus" : ""),
                getStakeAmount: () => (round === 1 ? 0 : 1),
                play: () => {
                    round++;
                },
                getWinAmount: () => 0,
            } as unknown as GameSessionHandling;
        }

        test("falls through to stake-based inference for rounds the explicit contract has no opinion on", () => {
            const runner = new AggregateSimulationRunner(createExplicitWithStakeFallbackSession(3), 3);

            runner.run();
            const breakdown = runner.getBreakdownStatistics();

            expect(Object.keys(breakdown!).sort()).toEqual(["base", "bonus", "freeGames"]);
            expect(breakdown!.bonus.rounds).toBe(1);
            expect(breakdown!.freeGames.rounds).toBe(1);
            expect(breakdown!.base.rounds).toBe(1);
        });
    });
});
