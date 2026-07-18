import {WeightedOutcomeLibraryAnalysis, WeightedOutcomeLibraryAnalysisDiffer} from "pokie";

const left: WeightedOutcomeLibraryAnalysis = {
    totalWeight: 100,
    rtp: 0.95,
    hitFrequency: 0.24,
    zeroWinFrequency: 0.76,
    variance: 12,
    standardDeviation: Math.sqrt(12),
    maxWin: 500,
    maxWinProbability: 0.001,
    payoutDistribution: [
        {payoutMultiplier: 0, probability: 0.76},
        {payoutMultiplier: 2, probability: 0.2},
        {payoutMultiplier: 500, probability: 0.04},
    ],
};

const right: WeightedOutcomeLibraryAnalysis = {
    totalWeight: 100,
    rtp: 0.97,
    hitFrequency: 0.26,
    zeroWinFrequency: 0.74,
    variance: 15,
    standardDeviation: Math.sqrt(15),
    maxWin: 600,
    maxWinProbability: 0.0008,
    payoutDistribution: [
        {payoutMultiplier: 0, probability: 0.74},
        {payoutMultiplier: 3, probability: 0.22},
        {payoutMultiplier: 600, probability: 0.04},
    ],
};

describe("WeightedOutcomeLibraryAnalysisDiffer", () => {
    it("computes a per-metric {left,right,delta,percentDelta} diff for every scalar analysis field", () => {
        const diff = new WeightedOutcomeLibraryAnalysisDiffer().diff(left, right);

        expect(diff.rtp.left).toBe(0.95);
        expect(diff.rtp.right).toBe(0.97);
        expect(diff.rtp.delta).toBeCloseTo(0.02, 10);
        expect(diff.rtp.percentDelta).toBeCloseTo((0.02 / 0.95) * 100, 10);

        expect(diff.hitFrequency.delta).toBeCloseTo(0.02, 10);
        expect(diff.hitFrequency.percentDelta).toBeCloseTo((0.02 / 0.24) * 100, 10);

        expect(diff.variance).toEqual({left: 12, right: 15, delta: 3, percentDelta: (3 / 12) * 100});
        expect(diff.standardDeviation.left).toBeCloseTo(Math.sqrt(12), 10);
        expect(diff.standardDeviation.right).toBeCloseTo(Math.sqrt(15), 10);
        expect(diff.maxWin).toEqual({left: 500, right: 600, delta: 100, percentDelta: (100 / 500) * 100});
    });

    it("reports a null percentDelta when the left side of a metric is exactly zero", () => {
        const diff = new WeightedOutcomeLibraryAnalysisDiffer().diff(
            {...left, maxWin: 0, maxWinProbability: 0},
            {...right, maxWin: 50},
        );

        expect(diff.maxWin.left).toBe(0);
        expect(diff.maxWin.percentDelta).toBeNull();
    });

    it("aligns payoutDistribution buckets by multiplier value, filling a missing side with null", () => {
        const diff = new WeightedOutcomeLibraryAnalysisDiffer().diff(left, right);

        expect(diff.payoutDistribution).toEqual([
            {payoutMultiplier: 0, left: 0.76, right: 0.74},
            {payoutMultiplier: 2, left: 0.2, right: null},
            {payoutMultiplier: 3, left: null, right: 0.22},
            {payoutMultiplier: 500, left: 0.04, right: null},
            {payoutMultiplier: 600, left: null, right: 0.04},
        ]);
    });

    it("produces no warnings when both analyses are identical", () => {
        const diff = new WeightedOutcomeLibraryAnalysisDiffer().diff(left, left);

        expect(diff.warnings).toEqual([]);
    });

    it("warns when rtp/hitFrequency/maxWin deltas exceed the configured thresholds", () => {
        const diff = new WeightedOutcomeLibraryAnalysisDiffer().diff(left, right);

        expect(diff.warnings).toEqual([
            expect.stringContaining("RTP changed by"),
            expect.stringContaining("Hit frequency changed by"),
            expect.stringContaining("Max win changed by"),
        ]);
    });

    it("warns explicitly when max win goes from 0 to a nonzero value, instead of a meaningless percent delta", () => {
        const diff = new WeightedOutcomeLibraryAnalysisDiffer().diff({...left, maxWin: 0}, {...right, maxWin: 40});

        expect(diff.warnings).toContainEqual(expect.stringContaining("Max win went from 0 to 40"));
    });

    it("stays quiet below the configured thresholds", () => {
        const almostSame: WeightedOutcomeLibraryAnalysis = {...left, rtp: left.rtp + 0.0001, hitFrequency: left.hitFrequency + 0.0001};
        const diff = new WeightedOutcomeLibraryAnalysisDiffer().diff(left, almostSame);

        expect(diff.warnings).toEqual([]);
    });

    it("honors custom warning thresholds passed to the constructor", () => {
        const differ = new WeightedOutcomeLibraryAnalysisDiffer(0.5, 0.5, 1000);
        const diff = differ.diff(left, right);

        expect(diff.warnings).toEqual([]);
    });
});
