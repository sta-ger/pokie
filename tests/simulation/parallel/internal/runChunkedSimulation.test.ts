import {AggregateSimulationRunner, SimulationReportBuilder, type GameSessionHandling, type VideoSlotSession} from "@fromstan/pokie";
import {weightedBlueprint, weightedGame} from "../../../v2/fixtures/WeightedWholeSequenceGame.js";
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
    test("zero-round chunks preserve configured unseen and zero-weight coverage from a reused session", async () => {
        const blueprint = JSON.parse(JSON.stringify(weightedBlueprint)) as typeof weightedBlueprint;
        if (blueprint.reelSequences?.[0].type !== "weighted") throw new Error("Expected weighted reel");
        blueprint.reelSequences[0].variants.push({id: "zero", symbols: ["A", "B"], weight: 0});
        const game = weightedGame(blueprint),
            session = game.createSession({seed: 1}) as VideoSlotSession;
        session.play();
        const before = session.toSessionState();
        const direct = new AggregateSimulationRunner(session, 0).run().getStatistics();
        const chunked = await runChunkedSimulation(session, 0, 1);
        const statistics = chunked.accumulator.getStatistics();
        expect(statistics).toEqual(direct);
        expect(statistics.reelSequences![0]).toMatchObject({selections: 0, variants: [
            {id: "all-A", count: 0, frequency: 0, uncovered: true},
            {id: "all-B", count: 0, frequency: 0, uncovered: true},
            {id: "zero", count: 0, frequency: 0, uncovered: false},
        ]});
        expect(session.toSessionState()).toEqual(before);
        expect(new SimulationReportBuilder().build({manifest: game.getManifest(), requestedRounds: 0, statistics, durationMs: 0}).reelSequences).toEqual(direct.reelSequences);
    });
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
