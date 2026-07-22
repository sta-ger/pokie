import type {StakeEngineStandaloneAnalysis, StakeEngineStandaloneModeAnalysis} from "../../../src/stakeengine/standalone/StakeEngineStandaloneAnalysis.js";
import {StakeEngineStandaloneAnalysisDiffer} from "../../../src/stakeengine/standalone/StakeEngineStandaloneAnalysisDiffer.js";

function buildMode(modeName: string, overrides: Partial<StakeEngineStandaloneModeAnalysis> = {}): StakeEngineStandaloneModeAnalysis {
    return {
        modeName,
        cost: 1,
        outcomeCount: 100,
        totalWeight: 1000,
        rtp: 0.95,
        hitFrequency: 0.25,
        zeroWinFrequency: 0.75,
        variance: 12,
        standardDeviation: Math.sqrt(12),
        maxPayoutMultiplier: 500,
        maxRatio: 500,
        maxWinProbability: 0.001,
        nonInvertibleRatioCount: 0,
        payoutDistribution: [
            {payoutMultiplier: 0, ratio: 0, probability: 0.75},
            {payoutMultiplier: 500, ratio: 500, probability: 0.001},
        ],
        eventClassificationBreakdown: [
            {category: "reveal", occurrenceFrequency: 1, averageOccurrencesPerOutcome: 1},
            {category: "win", occurrenceFrequency: 0.25, averageOccurrencesPerOutcome: 0.25},
        ],
        ...overrides,
    };
}

function buildAnalysis(modes: readonly StakeEngineStandaloneModeAnalysis[], stakeDir = "/fake/stake-dir"): StakeEngineStandaloneAnalysis {
    return {stakeDir, modes};
}

describe("StakeEngineStandaloneAnalysisDiffer", () => {
    it("diffs every numeric mode metric and produces no warnings for identical inputs", () => {
        const analysis = buildAnalysis([buildMode("base")]);
        const diff = new StakeEngineStandaloneAnalysisDiffer().diff(analysis, analysis);
        const modeDiff = diff.perMode.base;

        expect(diff.stakeDir).toEqual({left: "/fake/stake-dir", right: "/fake/stake-dir"});
        expect(diff.onlyInLeft).toEqual([]);
        expect(diff.onlyInRight).toEqual([]);
        expect(modeDiff.warnings).toEqual([]);
        expect(modeDiff.rtp).toEqual({left: 0.95, right: 0.95, delta: 0, percentDelta: 0});
        expect(modeDiff.hitFrequency.delta).toBe(0);
        expect(modeDiff.zeroWinFrequency.delta).toBe(0);
        expect(modeDiff.variance.delta).toBe(0);
        expect(modeDiff.standardDeviation.delta).toBe(0);
        expect(modeDiff.maxPayoutMultiplier.delta).toBe(0);
        expect(modeDiff.maxRatio.delta).toBe(0);
        expect(modeDiff.maxWinProbability.delta).toBe(0);
        expect(modeDiff.nonInvertibleRatioCount.delta).toBe(0);
    });

    it("uses null percentDelta when a left metric is zero", () => {
        const left = buildAnalysis([buildMode("base", {maxRatio: 0})]);
        const right = buildAnalysis([buildMode("base", {maxRatio: 10})]);

        const diff = new StakeEngineStandaloneAnalysisDiffer().diff(left, right);

        expect(diff.perMode.base.maxRatio).toEqual({left: 0, right: 10, delta: 10, percentDelta: null});
        expect(diff.perMode.base.warnings).toContainEqual(expect.stringContaining("Max ratio went from 0 to 10"));
    });

    it("warns for rtp, hit frequency, and max ratio drifts at their thresholds", () => {
        const left = buildAnalysis([buildMode("base")]);
        const right = buildAnalysis([buildMode("base", {rtp: 0.97, hitFrequency: 0.27, maxRatio: 600})]);

        const diff = new StakeEngineStandaloneAnalysisDiffer().diff(left, right);

        expect(diff.perMode.base.warnings).toEqual([
            expect.stringContaining("RTP changed by"),
            expect.stringContaining("Hit frequency changed by"),
            expect.stringContaining("Max ratio changed by"),
        ]);
    });

    it("stays quiet when rtp, hit frequency, and max ratio drifts are below their thresholds", () => {
        const left = buildAnalysis([buildMode("base")]);
        const right = buildAnalysis([buildMode("base", {rtp: 0.955, hitFrequency: 0.255, maxRatio: 525})]);

        const diff = new StakeEngineStandaloneAnalysisDiffer().diff(left, right);

        expect(diff.perMode.base.warnings).toEqual([]);
    });

    it("honors custom warning thresholds passed to the constructor", () => {
        const left = buildAnalysis([buildMode("base")]);
        const right = buildAnalysis([buildMode("base", {rtp: 0.97, hitFrequency: 0.27, maxRatio: 600})]);

        const diff = new StakeEngineStandaloneAnalysisDiffer(0.5, 0.5, 1000).diff(left, right);

        expect(diff.perMode.base.warnings).toEqual([]);
    });

    it("lists a mode present only on the left without diffing it against zero", () => {
        const left = buildAnalysis([buildMode("base"), buildMode("buy-10")]);
        const right = buildAnalysis([buildMode("base")]);

        const diff = new StakeEngineStandaloneAnalysisDiffer().diff(left, right);

        expect(diff.onlyInLeft).toEqual(["buy-10"]);
        expect(diff.onlyInRight).toEqual([]);
        expect(diff.perMode["buy-10"]).toBeUndefined();
    });

    it("lists a mode present only on the right without silently dropping it", () => {
        const left = buildAnalysis([buildMode("base")]);
        const right = buildAnalysis([buildMode("base"), buildMode("buy-20")]);

        const diff = new StakeEngineStandaloneAnalysisDiffer().diff(left, right);

        expect(diff.onlyInLeft).toEqual([]);
        expect(diff.onlyInRight).toEqual(["buy-20"]);
        expect(diff.perMode["buy-20"]).toBeUndefined();
    });

    it("aligns payout distribution buckets by payoutMultiplier with null for added and removed buckets", () => {
        const left = buildAnalysis([buildMode("base", {
            payoutDistribution: [
                {payoutMultiplier: 0, ratio: 0, probability: 0.75},
                {payoutMultiplier: 100, ratio: 100, probability: 0.1},
            ],
        })]);
        const right = buildAnalysis([buildMode("base", {
            payoutDistribution: [
                {payoutMultiplier: 0, ratio: 0, probability: 0.7},
                {payoutMultiplier: 200, ratio: 200, probability: 0.2},
            ],
        })]);

        const diff = new StakeEngineStandaloneAnalysisDiffer().diff(left, right);

        expect(diff.perMode.base.payoutDistribution).toEqual([
            {payoutMultiplier: 0, left: 0.75, right: 0.7},
            {payoutMultiplier: 100, left: 0.1, right: null},
            {payoutMultiplier: 200, left: null, right: 0.2},
        ]);
    });

    it("aligns event classification categories with null for added and removed categories", () => {
        const left = buildAnalysis([buildMode("base", {
            eventClassificationBreakdown: [
                {category: "reveal", occurrenceFrequency: 1, averageOccurrencesPerOutcome: 1},
                {category: "feature", occurrenceFrequency: 0.1, averageOccurrencesPerOutcome: 0.2},
            ],
        })]);
        const right = buildAnalysis([buildMode("base", {
            eventClassificationBreakdown: [
                {category: "reveal", occurrenceFrequency: 1, averageOccurrencesPerOutcome: 1},
                {category: "win", occurrenceFrequency: 0.25, averageOccurrencesPerOutcome: 0.3},
            ],
        })]);

        const diff = new StakeEngineStandaloneAnalysisDiffer().diff(left, right);

        expect(diff.perMode.base.eventClassificationBreakdown).toEqual([
            {category: "feature", left: {occurrenceFrequency: 0.1, averageOccurrencesPerOutcome: 0.2}, right: null},
            {category: "reveal", left: {occurrenceFrequency: 1, averageOccurrencesPerOutcome: 1}, right: {occurrenceFrequency: 1, averageOccurrencesPerOutcome: 1}},
            {category: "win", left: null, right: {occurrenceFrequency: 0.25, averageOccurrencesPerOutcome: 0.3}},
        ]);
    });
});
