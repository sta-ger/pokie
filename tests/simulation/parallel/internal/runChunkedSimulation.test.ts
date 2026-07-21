import type {GameSessionHandling} from "pokie";
import {runChunkedSimulation} from "../../../../src/simulation/parallel/internal/runChunkedSimulation.js";

function createJackpotAwareSession(options: {contributionPerRound?: number; awardEveryNth?: number; awardAmount?: number} = {}): GameSessionHandling {
    const contributionPerRound = options.contributionPerRound ?? 1;
    const awardEveryNth = options.awardEveryNth ?? 0;
    const awardAmount = options.awardAmount ?? 0;
    let round = 0;
    let awardCount = 0;
    let totalAwarded = 0;
    let totalContributed = 0;
    return {
        getCreditsAmount: () => Number.MAX_SAFE_INTEGER,
        setCreditsAmount: () => undefined,
        getBet: () => 1,
        setBet: () => undefined,
        getAvailableBets: () => [1],
        canPlayNextGame: () => true,
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
            pools: {mini: {awardCount, totalAwarded, totalContributed}},
        }),
    } as unknown as GameSessionHandling;
}

describe("runChunkedSimulation jackpot statistics", () => {
    // Splitting the same total rounds into more/fewer chunks must never change the merged jackpot totals
    // -- each chunk's own AggregateSimulationRunner.getJackpotStatistics() is already scoped to just that
    // chunk's own rounds (subtractJackpotStatisticsSnapshots), so additively merging N chunks' worth is
    // chunk-count-independent by construction. This is the regression test for that property.
    test("chunkSize=1 and chunkSize=all produce identical jackpot statistics", async () => {
        const options = {contributionPerRound: 3, awardEveryNth: 4, awardAmount: 250};

        const singleChunk = await runChunkedSimulation(createJackpotAwareSession(options), 20, 20);
        const perRoundChunks = await runChunkedSimulation(createJackpotAwareSession(options), 20, 1);

        expect(singleChunk.jackpot).toEqual({
            awardCount: 5,
            totalAwarded: 1250,
            totalContributed: 60,
            pools: {mini: {awardCount: 5, totalAwarded: 1250, totalContributed: 60}},
        });
        expect(perRoundChunks.jackpot).toEqual(singleChunk.jackpot);
    });

    test("jackpot is undefined when the session doesn't expose JackpotStatisticsProviding", async () => {
        const session: GameSessionHandling = {
            getCreditsAmount: () => Number.MAX_SAFE_INTEGER,
            setCreditsAmount: () => undefined,
            getBet: () => 1,
            setBet: () => undefined,
            getAvailableBets: () => [1],
            canPlayNextGame: () => true,
            play: () => undefined,
            getWinAmount: () => 0,
        };

        const result = await runChunkedSimulation(session, 5, 2);

        expect(result.jackpot).toBeUndefined();
    });
});
