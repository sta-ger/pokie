import {
    StakeEngineStandaloneAnalysisDiffer,
    StakeEngineStandaloneAnalyzer,
    type StakeEngineOutcomeSourceReadResult,
    type StakeEngineStandaloneAnalysis,
    type StakeEngineStandaloneModeAnalysis,
} from "pokie";

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
            {payoutMultiplier: 0, weight: 750, ratio: 0, probability: 0.75},
            {payoutMultiplier: 500, weight: 1, ratio: 500, probability: 0.001},
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
                {payoutMultiplier: 0, weight: 750, ratio: 0, probability: 0.75},
                {payoutMultiplier: 100, weight: 100, ratio: 100, probability: 0.1},
            ],
        })]);
        const right = buildAnalysis([buildMode("base", {
            payoutDistribution: [
                {payoutMultiplier: 0, weight: 700, ratio: 0, probability: 0.7},
                {payoutMultiplier: 200, weight: 200, ratio: 200, probability: 0.2},
            ],
        })]);

        const diff = new StakeEngineStandaloneAnalysisDiffer().diff(left, right);

        expect(diff.perMode.base.payoutDistribution).toEqual([
            {payoutMultiplier: 0, left: 0.75, right: 0.7},
            {payoutMultiplier: 100, left: 0.1, right: null},
            {payoutMultiplier: 200, left: null, right: 0.2},
        ]);
    });

    it("passes uint64-scale exact-decimal strings through a sequential diff without ever coercing them to a lossy number", () => {
        // Two sequential analyses whose totals exceed Number.MAX_SAFE_INTEGER, so probabilities/frequencies arrive as
        // canonical decimal strings (including a 40-place non-terminating one). The differ aligns them but must never
        // reparse a string into a float -- doing so would silently truncate the exact value it was built to preserve.
        const nonTerminating = "0." + "3".repeat(40);
        const left = buildAnalysis([buildMode("base", {
            totalWeight: "10000000000000000000",
            payoutDistribution: [
                {payoutMultiplier: 0, weight: "9700000000000000000", ratio: 0, probability: "0.97"},
                {payoutMultiplier: 100, weight: "300000000000000000", ratio: 1, probability: nonTerminating},
            ],
            eventClassificationBreakdown: [
                {category: "reveal", occurrenceFrequency: "1", averageOccurrencesPerOutcome: "1"},
                {category: "win", occurrenceFrequency: "0.03", averageOccurrencesPerOutcome: nonTerminating},
            ],
        })]);
        const right = buildAnalysis([buildMode("base", {
            totalWeight: "20000000000000000000",
            payoutDistribution: [
                {payoutMultiplier: 0, weight: "19900000000000000000", ratio: 0, probability: "0.995"},
                {payoutMultiplier: 100, weight: "100000000000000000", ratio: 1, probability: "0.005"},
            ],
            eventClassificationBreakdown: [
                {category: "reveal", occurrenceFrequency: "1", averageOccurrencesPerOutcome: "1"},
                {category: "win", occurrenceFrequency: "0.005", averageOccurrencesPerOutcome: "0.005"},
            ],
        })]);

        const diff = new StakeEngineStandaloneAnalysisDiffer().diff(left, right);

        expect(diff.perMode.base.payoutDistribution).toEqual([
            {payoutMultiplier: 0, left: "0.97", right: "0.995"},
            {payoutMultiplier: 100, left: nonTerminating, right: "0.005"},
        ]);
        expect(diff.perMode.base.eventClassificationBreakdown).toEqual([
            {category: "reveal", left: {occurrenceFrequency: "1", averageOccurrencesPerOutcome: "1"}, right: {occurrenceFrequency: "1", averageOccurrencesPerOutcome: "1"}},
            {category: "win", left: {occurrenceFrequency: "0.03", averageOccurrencesPerOutcome: nonTerminating}, right: {occurrenceFrequency: "0.005", averageOccurrencesPerOutcome: "0.005"}},
        ]);
        // Every carried-through exact decimal stays a string; the 40-place value is preserved digit-for-digit.
        expect(diff.perMode.base.payoutDistribution[1].left).toBe(nonTerminating);
        expect(typeof diff.perMode.base.payoutDistribution[0].right).toBe("string");
    });

    it("diffs two real uint64-scale analyzer outputs -- not hand-built mode analyses -- carrying exact string probabilities through the sequential path untouched", () => {
        // Build the left/right analyses through the genuine StakeEngineStandaloneAnalyzer over uint64-scale weights whose
        // totals exceed Number.MAX_SAFE_INTEGER, so the analyzer itself emits canonical decimal strings. This closes the
        // gap the other sequential test leaves: it hand-builds mode analyses, whereas here the strings the differ aligns
        // are produced by the real analyze() path, proving a two-analysis (sequential) comparison never re-floats them.
        const buildReadResult = (lossWeight: bigint, winWeight: bigint): StakeEngineOutcomeSourceReadResult => ({
            stakeDir: "/fake/stake-dir",
            issues: [],
            modes: [
                {
                    modeName: "base",
                    cost: 1,
                    outcomes: [
                        {id: 0, weight: lossWeight, payoutMultiplier: 0, ratio: 0, events: [{index: 0, type: "reveal"}]},
                        {id: 1, weight: winWeight, payoutMultiplier: 100, ratio: 1, events: [{index: 0, type: "win", amount: 100}]},
                    ],
                },
            ],
        });
        const analyzer = new StakeEngineStandaloneAnalyzer();
        // Both totals are 1e19 -- above Number.MAX_SAFE_INTEGER yet inside uint64 -- with different splits: left is
        // 0.97 / 0.03, right is 0.995 / 0.005.
        const left = analyzer.analyze(buildReadResult(BigInt("9700000000000000000"), BigInt("300000000000000000")));
        const right = analyzer.analyze(buildReadResult(BigInt("9950000000000000000"), BigInt("50000000000000000")));

        // The analyzer must have emitted string probabilities/totalWeight in the first place, or this test would be
        // asserting against numbers and silently miss a re-float regression.
        expect(left.modes[0].totalWeight).toBe("10000000000000000000");
        expect(right.modes[0].totalWeight).toBe("10000000000000000000");
        expect(left.modes[0].payoutDistribution.every((bucket) => typeof bucket.probability === "string")).toBe(true);

        const diff = new StakeEngineStandaloneAnalysisDiffer().diff(left, right);

        expect(diff.perMode.base.payoutDistribution).toEqual([
            {payoutMultiplier: 0, left: "0.97", right: "0.995"},
            {payoutMultiplier: 100, left: "0.03", right: "0.005"},
        ]);
        expect(diff.perMode.base.payoutDistribution.every((bucket) => typeof bucket.left === "string" && typeof bucket.right === "string")).toBe(true);
        // The numeric metrics (rtp/hitFrequency), which never leave Number range, still diff: 0.005 - 0.03.
        expect(diff.perMode.base.rtp.left).toBeCloseTo(0.03, 10);
        expect(diff.perMode.base.rtp.right).toBeCloseTo(0.005, 10);
        expect(diff.perMode.base.rtp.delta).toBeCloseTo(-0.025, 10);
        expect(diff.perMode.base.rtp.percentDelta).toBeCloseTo(-83.333, 2);
        expect(diff.perMode.base.hitFrequency.delta).toBeCloseTo(-0.025, 10);
    });

    it("diffs a mode literally named \"__proto__\" as a real own entry instead of reassigning perMode's prototype", () => {
        const protoName = "__proto__";
        const left = buildAnalysis([buildMode(protoName)]);
        const right = buildAnalysis([buildMode(protoName, {rtp: 0.5})]);

        const diff = new StakeEngineStandaloneAnalysisDiffer().diff(left, right);

        // Own-property lookup (not a prototype fall-through) must find the entry, and it must show up in the
        // enumerable key set -- a plain `{}` accumulator would silently drop it via the "__proto__" setter instead.
        expect(Reflect.apply(Object.prototype.hasOwnProperty, diff.perMode, [protoName])).toBe(true);
        expect(Object.keys(diff.perMode)).toEqual([protoName]);
        expect(diff.perMode[protoName].rtp.left).toBe(0.95);
        expect(diff.perMode[protoName].rtp.right).toBe(0.5);
        expect(diff.perMode[protoName].rtp.delta).toBeCloseTo(-0.45, 10);

        // No prototype was actually reassigned, and no other (nonexistent) mode key leaks the "__proto__" mode's
        // own fields back out through the prototype chain.
        expect(Reflect.getPrototypeOf(diff.perMode)).toBeNull();
        expect(diff.perMode["some-other-mode"]).toBeUndefined();
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
