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

    // The default determiner chain only ever produces categories that already went through
    // SimulationCategoryNameNormalizer (see ExplicitSimulationRoundCategoryDeterminer). But the 4th
    // constructor argument accepts ANY SimulationRoundCategoryDetermining — a hand-written one has no
    // reason to know about that normalizer, so the runner itself has to guard against it returning
    // something unsafe, not just the built-in explicit determiner.
    describe("central category normalization (applies to every determiner, not just the built-in explicit one)", () => {
        function customDeterminer(category: string) {
            return {
                supportsRoundCategorization: () => true,
                categorizeRound: () => category,
            };
        }

        test("an empty category from a custom determiner is excluded from the breakdown, not used as a key", () => {
            const runner = new AggregateSimulationRunner(createBaseOnlySession(5), 5, undefined, customDeterminer(""));

            runner.run();

            expect(runner.getBreakdownStatistics()).toBeUndefined();
        });

        test("a whitespace-only category from a custom determiner is excluded from the breakdown", () => {
            const runner = new AggregateSimulationRunner(createBaseOnlySession(5), 5, undefined, customDeterminer("   "));

            runner.run();

            expect(runner.getBreakdownStatistics()).toBeUndefined();
        });

        test("an over-long category from a custom determiner is excluded from the breakdown", () => {
            const tooLong = "a".repeat(65); // SimulationCategoryNameNormalizer.MAX_LENGTH is 64
            const runner = new AggregateSimulationRunner(createBaseOnlySession(5), 5, undefined, customDeterminer(tooLong));

            runner.run();

            expect(runner.getBreakdownStatistics()).toBeUndefined();
        });

        test("a category with invalid characters from a custom determiner is excluded from the breakdown", () => {
            const runner = new AggregateSimulationRunner(createBaseOnlySession(5), 5, undefined, customDeterminer("bonus round!"));

            runner.run();

            expect(runner.getBreakdownStatistics()).toBeUndefined();
        });

        test("still normalizes (trims) a valid-but-untrimmed category from a custom determiner", () => {
            const runner = new AggregateSimulationRunner(createBaseOnlySession(5), 5, undefined, customDeterminer("  bonus  "));

            runner.run();
            const breakdown = runner.getBreakdownStatistics();

            expect(Object.keys(breakdown!)).toEqual(["bonus"]);
            expect(breakdown!.bonus.rounds).toBe(5);
        });

        test("the overall simulation still completes normally even when every round's category is invalid", () => {
            const runner = new AggregateSimulationRunner(createBaseOnlySession(5), 5, undefined, customDeterminer(""));

            const statistics = runner.run().getStatistics();

            expect(statistics.rounds).toBe(5);
        });
    });
});

describe("AggregateSimulationRunner jackpot statistics", () => {
    // Unlike the old fixture (a static snapshot returned regardless of rounds played), this one tracks
    // real, monotonically growing per-pool state as play() is actually called — required to test
    // run-scoping (subtractJackpotStatisticsSnapshots), which is only meaningfully exercised against a
    // session whose snapshot genuinely accumulates across calls. "sessionRoundLimit" is independent of
    // the AggregateSimulationRunner's own `rounds` constructor argument, so a session can be reused across
    // more rounds than any single run() call plays -- exactly the "same session, multiple run() calls"
    // scenario under test below.
    function createJackpotAwareSession(
        sessionRoundLimit: number,
        options: {
            poolId?: string;
            contributionPerRound?: number;
            awardEveryNth?: number;
            awardAmount?: number;
            initialSnapshot?: {awardCount: number; totalAwarded: number; totalContributed: number};
        } = {},
    ): GameSessionHandling {
        const poolId = options.poolId ?? "mini";
        const contributionPerRound = options.contributionPerRound ?? 1;
        const awardEveryNth = options.awardEveryNth ?? 0;
        const awardAmount = options.awardAmount ?? 0;
        let round = 0;
        let awardCount = options.initialSnapshot?.awardCount ?? 0;
        let totalAwarded = options.initialSnapshot?.totalAwarded ?? 0;
        let totalContributed = options.initialSnapshot?.totalContributed ?? 0;
        return {
            getCreditsAmount: () => Number.MAX_SAFE_INTEGER,
            setCreditsAmount: () => undefined,
            getBet: () => 1,
            setBet: () => undefined,
            getAvailableBets: () => [1],
            canPlayNextGame: () => round < sessionRoundLimit,
            play: () => {
                round++;
                totalContributed += contributionPerRound;
                if (awardEveryNth > 0 && round % awardEveryNth === 0) {
                    awardCount++;
                    totalAwarded += awardAmount;
                }
            },
            getWinAmount: () => 0,
            getJackpotStatisticsSnapshot: () => ({
                awardCount,
                totalAwarded,
                totalContributed,
                pools: {[poolId]: {awardCount, totalAwarded, totalContributed}},
            }),
        } as unknown as GameSessionHandling;
    }

    test("getJackpotStatistics() is undefined before run() is called", () => {
        const runner = new AggregateSimulationRunner(createJackpotAwareSession(5), 5);

        expect(runner.getJackpotStatistics()).toBeUndefined();
    });

    test("getJackpotStatistics() is undefined when the session doesn't expose JackpotStatisticsProviding", () => {
        const runner = new AggregateSimulationRunner(createBaseOnlySession(5), 5);

        runner.run();

        expect(runner.getJackpotStatistics()).toBeUndefined();
    });

    test("getJackpotStatistics() reads the session's own snapshot once, after run() finishes", () => {
        const session = createJackpotAwareSession(10, {contributionPerRound: 5, awardEveryNth: 5, awardAmount: 900});
        const runner = new AggregateSimulationRunner(session, 10);

        runner.run();

        expect(runner.getJackpotStatistics()).toEqual({
            awardCount: 2,
            totalAwarded: 1800,
            totalContributed: 50,
            pools: {mini: {awardCount: 2, totalAwarded: 1800, totalContributed: 50}},
        });
    });

    test("run() scopes jackpot statistics to only its own rounds, excluding history the session already had", () => {
        const session = createJackpotAwareSession(10, {
            contributionPerRound: 1,
            awardEveryNth: 5,
            awardAmount: 100,
            initialSnapshot: {awardCount: 5, totalAwarded: 999, totalContributed: 500},
        });
        const runner = new AggregateSimulationRunner(session, 10);

        runner.run();

        expect(runner.getJackpotStatistics()).toEqual({
            awardCount: 2,
            totalAwarded: 200,
            totalContributed: 10,
            pools: {mini: {awardCount: 2, totalAwarded: 200, totalContributed: 10}},
        });
    });

    test("calling run() twice on the same session reports only the second run's own jackpot activity", () => {
        const session = createJackpotAwareSession(1000, {contributionPerRound: 1, awardEveryNth: 5, awardAmount: 100});
        const runner = new AggregateSimulationRunner(session, 10);

        runner.run();
        const first = runner.getJackpotStatistics();
        runner.run();
        const second = runner.getJackpotStatistics();

        expect(first).toEqual({
            awardCount: 2,
            totalAwarded: 200,
            totalContributed: 10,
            pools: {mini: {awardCount: 2, totalAwarded: 200, totalContributed: 10}},
        });
        expect(second).toEqual(first);
    });

    test("restored/pre-populated session state does not leak old awards/contributions into a fresh run's report", () => {
        const session = createJackpotAwareSession(3, {
            contributionPerRound: 10,
            awardEveryNth: 0,
            initialSnapshot: {awardCount: 7, totalAwarded: 12345, totalContributed: 6789},
        });
        const runner = new AggregateSimulationRunner(session, 3);

        runner.run();

        expect(runner.getJackpotStatistics()).toEqual({
            awardCount: 0,
            totalAwarded: 0,
            totalContributed: 30,
            pools: {mini: {awardCount: 0, totalAwarded: 0, totalContributed: 30}},
        });
    });
});
