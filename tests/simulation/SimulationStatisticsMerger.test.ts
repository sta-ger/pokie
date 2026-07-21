import {SimulationAccumulator, SimulationStatisticsMerger, type JackpotStatisticsSnapshot} from "pokie";

describe("SimulationStatisticsMerger", () => {
    test("merging a single entry reproduces that entry's own statistics exactly", () => {
        const accumulator = new SimulationAccumulator();
        accumulator.addRound(10, 0);
        accumulator.addRound(10, 50);
        accumulator.addRound(10, 5);

        const merger = new SimulationStatisticsMerger();
        const result = merger.merge([{accumulator: accumulator.toSnapshot()}]);

        expect(result.statistics).toEqual(accumulator.getStatistics());
        expect(result.breakdown).toBeUndefined();
    });

    test("merging an empty entry list produces zeroed-out statistics without throwing", () => {
        const merger = new SimulationStatisticsMerger();
        const result = merger.merge([]);

        expect(result.statistics.rounds).toBe(0);
        expect(result.statistics.totalBet).toBe(0);
        expect(Number.isNaN(result.statistics.rtp)).toBe(false);
    });

    // The critical property: merging N workers' accumulators must match one accumulator that saw
    // every round directly — mean/variance/confidence-interval are never averaged across workers,
    // only correctly combined via SimulationAccumulator's own online merge.
    test("merging several workers' accumulators matches a single accumulator that played every round directly", () => {
        const workerRounds: Array<Array<[number, number]>> = [
            [
                [10, 0],
                [10, 50],
                [10, 0],
            ],
            [
                [10, 20],
                [10, 0],
                [10, 0],
                [10, 100],
            ],
            [[10, 5]],
        ];

        const direct = new SimulationAccumulator();
        workerRounds.flat().forEach(([bet, payout]) => direct.addRound(bet, payout));

        const entries = workerRounds.map((rounds) => {
            const accumulator = new SimulationAccumulator();
            rounds.forEach(([bet, payout]) => accumulator.addRound(bet, payout));
            return {accumulator: accumulator.toSnapshot()};
        });

        const merger = new SimulationStatisticsMerger();
        const merged = merger.merge(entries).statistics;
        const expected = direct.getStatistics();

        expect(merged.rounds).toBe(expected.rounds);
        expect(merged.totalBet).toBe(expected.totalBet);
        expect(merged.totalPayout).toBe(expected.totalPayout);
        expect(merged.hitCount).toBe(expected.hitCount);
        expect(merged.maxWin).toBe(expected.maxWin);
        expect(merged.rtp).toBeCloseTo(expected.rtp, 10);
        expect(merged.payoutStandardDeviation).toBeCloseTo(expected.payoutStandardDeviation, 10);
        expect(merged.returnStandardDeviation).toBeCloseTo(expected.returnStandardDeviation, 10);
        expect(merged.averagePayoutConfidenceInterval95.low).toBeCloseTo(expected.averagePayoutConfidenceInterval95.low, 10);
        expect(merged.averagePayoutConfidenceInterval95.high).toBeCloseTo(expected.averagePayoutConfidenceInterval95.high, 10);
        expect(merged.rtpConfidenceInterval95.low).toBeCloseTo(expected.rtpConfidenceInterval95.low, 10);
        expect(merged.rtpConfidenceInterval95.high).toBeCloseTo(expected.rtpConfidenceInterval95.high, 10);
    });

    test("merges payout histograms across entries by summing bucket counts", () => {
        const a = new SimulationAccumulator();
        a.addRound(1, 0);
        a.addRound(1, 5);
        const b = new SimulationAccumulator();
        b.addRound(1, 0);
        b.addRound(1, 200);

        const merger = new SimulationStatisticsMerger();
        const merged = merger.merge([{accumulator: a.toSnapshot()}, {accumulator: b.toSnapshot()}]).statistics;

        expect(merged.payoutHistogram["0"]).toBe(2);
        expect(merged.payoutHistogram["1-9"]).toBe(1);
        expect(merged.payoutHistogram["100+"]).toBe(1);
    });

    test("merges category breakdowns across entries (rounds/bet/win summed, maxWin taken as the max)", () => {
        const a = new SimulationAccumulator();
        a.addRound(1, 0);
        const b = new SimulationAccumulator();
        b.addRound(1, 0);

        const merger = new SimulationStatisticsMerger();
        const result = merger.merge([
            {
                accumulator: a.toSnapshot(),
                breakdown: {
                    base: {rounds: 80, totalBet: 80, totalWin: 70, rtp: 0.875, hitFrequency: 0.2, maxWin: 50},
                    freeGames: {rounds: 20, totalBet: 0, totalWin: 40, rtp: Infinity, hitFrequency: 0.5, maxWin: 40},
                },
            },
            {
                accumulator: b.toSnapshot(),
                breakdown: {
                    base: {rounds: 120, totalBet: 120, totalWin: 100, rtp: 0.833, hitFrequency: 0.25, maxWin: 90},
                    freeGames: {rounds: 30, totalBet: 0, totalWin: 60, rtp: Infinity, hitFrequency: 0.4, maxWin: 30},
                },
            },
        ]);

        expect(result.breakdown).toBeDefined();
        expect(result.breakdown!.base.rounds).toBe(200);
        expect(result.breakdown!.base.totalBet).toBe(200);
        expect(result.breakdown!.base.totalWin).toBe(170);
        expect(result.breakdown!.base.maxWin).toBe(90);
        expect(result.breakdown!.freeGames.rounds).toBe(50);
        expect(result.breakdown!.freeGames.totalWin).toBe(100);
        expect(result.breakdown!.freeGames.maxWin).toBe(40);
    });

    test("leaves breakdown undefined when no entry has one, and folds in only the entries that do", () => {
        const noBreakdown = new SimulationAccumulator();
        noBreakdown.addRound(1, 0);
        const withBreakdown = new SimulationAccumulator();
        withBreakdown.addRound(1, 0);

        const merger = new SimulationStatisticsMerger();

        const allMissing = merger.merge([{accumulator: noBreakdown.toSnapshot()}, {accumulator: noBreakdown.toSnapshot()}]);
        expect(allMissing.breakdown).toBeUndefined();

        const mixed = merger.merge([
            {accumulator: noBreakdown.toSnapshot()},
            {
                accumulator: withBreakdown.toSnapshot(),
                breakdown: {base: {rounds: 1, totalBet: 1, totalWin: 0, rtp: 0, hitFrequency: 0, maxWin: 0}},
            },
        ]);
        expect(mixed.breakdown).toBeDefined();
        expect(mixed.breakdown!.base.rounds).toBe(1);
    });

    test("merges jackpot statistics across workers (per-worker cross-worker merge, via mergeJackpotStatisticsSnapshots)", () => {
        const a = new SimulationAccumulator();
        a.addRound(1, 0);
        const b = new SimulationAccumulator();
        b.addRound(1, 0);
        const jackpotA: JackpotStatisticsSnapshot = {
            awardCount: 1,
            totalAwarded: 500,
            totalContributed: 100,
            pools: {mini: {awardCount: 1, totalAwarded: 500, totalContributed: 100}},
        };
        const jackpotB: JackpotStatisticsSnapshot = {
            awardCount: 2,
            totalAwarded: 900,
            totalContributed: 50,
            pools: {mini: {awardCount: 2, totalAwarded: 900, totalContributed: 50}},
        };

        const merger = new SimulationStatisticsMerger();
        const result = merger.merge([
            {accumulator: a.toSnapshot(), jackpot: jackpotA},
            {accumulator: b.toSnapshot(), jackpot: jackpotB},
        ]);

        expect(result.jackpot).toEqual({
            awardCount: 3,
            totalAwarded: 1400,
            totalContributed: 150,
            pools: {mini: {awardCount: 3, totalAwarded: 1400, totalContributed: 150}},
        });
    });

    test("leaves jackpot undefined when no entry has one, and folds in only the entries that do", () => {
        const noJackpot = new SimulationAccumulator();
        noJackpot.addRound(1, 0);
        const withJackpot = new SimulationAccumulator();
        withJackpot.addRound(1, 0);

        const merger = new SimulationStatisticsMerger();

        const allMissing = merger.merge([{accumulator: noJackpot.toSnapshot()}, {accumulator: noJackpot.toSnapshot()}]);
        expect(allMissing.jackpot).toBeUndefined();

        const mixed = merger.merge([
            {accumulator: noJackpot.toSnapshot()},
            {
                accumulator: withJackpot.toSnapshot(),
                jackpot: {awardCount: 1, totalAwarded: 500, totalContributed: 100, pools: {mini: {awardCount: 1, totalAwarded: 500, totalContributed: 100}}},
            },
        ]);
        expect(mixed.jackpot).toBeDefined();
        expect(mixed.jackpot!.awardCount).toBe(1);
    });
});
