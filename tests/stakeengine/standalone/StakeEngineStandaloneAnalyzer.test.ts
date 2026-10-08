import {rareStakeSource, expectRareMetrics, expectRelative, RARE_PROBABILITY, UINT64_MAX} from "./StakeProbabilityTestFixtures.js";
import {StakeEngineEventClassification, StakeEngineEventClassifying, StakeEngineEvent, StakeEngineOutcomeSourceReadResult, StakeEngineStandaloneAnalyzer} from "pokie";

// A small, hand-computable mode: a loss (weight 970), a plain win (weight 25, ratio 2), and a win with a
// non-structural "feature" event (weight 5, ratio 5) -- mirrors StakeEngineTestFixtures.buildStakeEngineTestLibrary
// but built directly as normalized StakeEngineOutcomeRecord data, with no RoundArtifact/WeightedOutcomeLibrary
// involved, so every statistic below can be checked by hand.
function handComputableReadResult(): StakeEngineOutcomeSourceReadResult {
    return {
        stakeDir: "/fake/stake-dir",
        issues: [],
        modes: [
            {
                modeName: "base",
                cost: 1,
                outcomes: [
                    {
                        id: 0,
                        weight: 970,
                        payoutMultiplier: 0,
                        ratio: 0,
                        events: [
                            {index: 0, type: "reveal"},
                            {index: 1, type: "finalWin", amount: 0, payoutMultiplier: 0},
                        ],
                    },
                    {
                        id: 1,
                        weight: 25,
                        payoutMultiplier: 200,
                        ratio: 2,
                        events: [
                            {index: 0, type: "reveal"},
                            {index: 1, type: "win", amount: 200},
                            {index: 2, type: "finalWin", amount: 200, payoutMultiplier: 200},
                        ],
                    },
                    {
                        id: 2,
                        weight: 5,
                        payoutMultiplier: 500,
                        ratio: 5,
                        events: [
                            {index: 0, type: "reveal"},
                            {index: 1, type: "freeGamesTriggered", count: 10},
                            {index: 2, type: "win", amount: 500},
                            {index: 3, type: "finalWin", amount: 500, payoutMultiplier: 500},
                        ],
                    },
                ],
            },
        ],
    };
}

describe("StakeEngineStandaloneAnalyzer", () => {
    it("computes exact weighted rtp/hitFrequency/variance/standardDeviation/maxWin over normalized outcomes, no RoundArtifact/WeightedOutcomeLibrary involved", () => {
        const analysis = new StakeEngineStandaloneAnalyzer().analyze(handComputableReadResult());

        expect(analysis.stakeDir).toBe("/fake/stake-dir");
        expect(analysis.modes.length).toBe(1);
        const [mode] = analysis.modes;

        expect(mode.modeName).toBe("base");
        expect(mode.cost).toBe(1);
        expect(mode.outcomeCount).toBe(3);
        expect(mode.totalWeight).toBe(1000);
        expect(mode.rtp).toBeCloseTo(0.075, 10);
        expect(mode.hitFrequency).toBeCloseTo(0.03, 10);
        expect(mode.zeroWinFrequency).toBeCloseTo(0.97, 10);
        expect(mode.variance).toBeCloseTo(0.219375, 10);
        expect(mode.standardDeviation).toBeCloseTo(Math.sqrt(0.219375), 10);
        expect(mode.maxPayoutMultiplier).toBe(500);
        expect(mode.maxRatio).toBe(5);
        expect(mode.maxWinProbability).toBeCloseTo(0.005, 10);
        expect(mode.nonInvertibleRatioCount).toBe(0);
    });

    it("builds an exact payout distribution keyed by the raw payoutMultiplier, sorted ascending, probabilities summing to 1", () => {
        const analysis = new StakeEngineStandaloneAnalyzer().analyze(handComputableReadResult());
        const [mode] = analysis.modes;

        expect(mode.payoutDistribution).toEqual([
            {payoutMultiplier: 0, weight: 970, ratio: 0, probability: 0.97},
            {payoutMultiplier: 200, weight: 25, ratio: 2, probability: 0.025},
            {payoutMultiplier: 500, weight: 5, ratio: 5, probability: 0.005},
        ]);
        const totalProbability = mode.payoutDistribution.reduce((sum, bucket) => sum + Number(bucket.probability), 0);
        expect(totalProbability).toBeCloseTo(1, 10);
    });

    it("uses the default StakeEngineStandardEventClassifier (structural reveal/win/finalWin, everything else 'feature') when no classifier is supplied", () => {
        const analysis = new StakeEngineStandaloneAnalyzer().analyze(handComputableReadResult());
        const [mode] = analysis.modes;

        const byCategory = new Map(mode.eventClassificationBreakdown.map((entry) => [entry.category, entry]));
        expect(byCategory.get("reveal")).toEqual({category: "reveal", occurrenceFrequency: 1, averageOccurrencesPerOutcome: 1});
        expect(byCategory.get("finalWin")).toEqual({category: "finalWin", occurrenceFrequency: 1, averageOccurrencesPerOutcome: 1});
        expect(byCategory.get("win")?.occurrenceFrequency).toBeCloseTo(0.03, 10);
        expect(byCategory.get("feature")?.occurrenceFrequency).toBeCloseTo(0.005, 10);
    });

    it("accepts a pluggable StakeEngineEventClassifying so a foreign event vocabulary never has to be classified as generic 'feature'", () => {
        class BonusTriggerClassifier implements StakeEngineEventClassifying {
            public classify(event: StakeEngineEvent): StakeEngineEventClassification {
                return {category: event.type === "freeGamesTriggered" ? "bonusTrigger" : "structural"};
            }
        }

        const analysis = new StakeEngineStandaloneAnalyzer(new BonusTriggerClassifier()).analyze(handComputableReadResult());
        const [mode] = analysis.modes;

        const byCategory = new Map(mode.eventClassificationBreakdown.map((entry) => [entry.category, entry]));
        expect(byCategory.has("feature")).toBe(false);
        expect(byCategory.get("bonusTrigger")?.occurrenceFrequency).toBeCloseTo(0.005, 10);
        expect(byCategory.get("structural")?.occurrenceFrequency).toBeCloseTo(1, 10);
    });

    it("falls back to an unchecked ratio for rtp/variance and reports nonInvertibleRatioCount when an outcome's own ratio couldn't be reversed exactly", () => {
        const readResult = handComputableReadResult();
        // Simulate what StakeEngineOutcomeSourceReader does when convertStakeUnitsToRatio can't guarantee an
        // exact reversal: ratio stays undefined, but payoutMultiplier/weight are untouched.
        const [baseMode] = readResult.modes;
        const outcomesWithUndefinedRatio = baseMode.outcomes.map((outcome, position) => (position === 1 ? {...outcome, ratio: undefined} : outcome));
        const mutatedReadResult: StakeEngineOutcomeSourceReadResult = {...readResult, modes: [{...baseMode, outcomes: outcomesWithUndefinedRatio}]};

        const analysis = new StakeEngineStandaloneAnalyzer().analyze(mutatedReadResult);
        const [mode] = analysis.modes;

        expect(mode.nonInvertibleRatioCount).toBe(1);
        // effectiveRatio falls back to payoutMultiplier / cost / 100 = 200 / 1 / 100 = 2, same as the checked value
        // here, so rtp/variance are unaffected in this particular fixture.
        expect(mode.rtp).toBeCloseTo(0.075, 10);
    });

    it("handles an empty issues list read result with multiple modes independently", () => {
        const readResult = handComputableReadResult();
        const secondMode: StakeEngineOutcomeSourceReadResult["modes"][number] = {
            modeName: "bonus",
            cost: 100,
            outcomes: [
                {id: 0, weight: 1, payoutMultiplier: 0, ratio: 0, events: [{index: 0, type: "reveal"}, {index: 1, type: "finalWin", amount: 0, payoutMultiplier: 0}]},
                {id: 1, weight: 1, payoutMultiplier: 1000, ratio: 10, events: [{index: 0, type: "reveal"}, {index: 1, type: "win", amount: 1000}, {index: 2, type: "finalWin", amount: 1000, payoutMultiplier: 1000}]},
            ],
        };

        const analysis = new StakeEngineStandaloneAnalyzer().analyze({...readResult, modes: [...readResult.modes, secondMode]});

        expect(analysis.modes.map((mode) => mode.modeName)).toEqual(["base", "bonus"]);
        expect(analysis.modes[1].rtp).toBeCloseTo(5, 10);
        expect(analysis.modes[1].hitFrequency).toBeCloseTo(0.5, 10);
    });

    it("reproduces the hand-computable statistics exactly when every weight is scaled to uint64 magnitude and the total exceeds Number.MAX_SAFE_INTEGER", () => {
        // The same 970/25/5 loss/win/win distribution as handComputableReadResult, but each weight scaled by 1e16
        // so the total (1e19) sits well above Number.MAX_SAFE_INTEGER and every weight stays inside uint64. Because
        // the ratios are identical, every exact statistic must be byte-for-byte the same as the small-integer case
        // -- checking this particular common weight scaling preserves the numeric results.
        const analysis = new StakeEngineStandaloneAnalyzer().analyze({
            stakeDir: "/fake/stake-dir",
            issues: [],
            modes: [
                {
                    modeName: "base",
                    cost: 1,
                    outcomes: [
                        {id: 0, weight: BigInt("9700000000000000000"), payoutMultiplier: 0, ratio: 0, events: [{index: 0, type: "reveal"}, {index: 1, type: "finalWin", amount: 0, payoutMultiplier: 0}]},
                        {id: 1, weight: BigInt("250000000000000000"), payoutMultiplier: 200, ratio: 2, events: [{index: 0, type: "reveal"}, {index: 1, type: "win", amount: 200}, {index: 2, type: "finalWin", amount: 200, payoutMultiplier: 200}]},
                        {id: 2, weight: BigInt("50000000000000000"), payoutMultiplier: 500, ratio: 5, events: [{index: 0, type: "reveal"}, {index: 1, type: "freeGamesTriggered", count: 10}, {index: 2, type: "win", amount: 500}, {index: 3, type: "finalWin", amount: 500, payoutMultiplier: 500}]},
                    ],
                },
            ],
        });

        const [mode] = analysis.modes;
        expect(mode.totalWeight).toBe("10000000000000000000");
        expect(mode.rtp).toBeCloseTo(0.075, 10);
        expect(mode.hitFrequency).toBeCloseTo(0.03, 10);
        expect(mode.zeroWinFrequency).toBeCloseTo(0.97, 10);
        expect(mode.variance).toBeCloseTo(0.219375, 10);
        expect(mode.standardDeviation).toBeCloseTo(Math.sqrt(0.219375), 10);
        expect(mode.maxPayoutMultiplier).toBe(500);
        expect(mode.maxRatio).toBe(5);
        // Canonical terminating decimals: 9.7e18/1e19, 2.5e17/1e19, 5e16/1e19 -- emitted as exact strings, not floats.
        expect(mode.payoutDistribution).toEqual([
            {payoutMultiplier: 0, weight: "9700000000000000000", ratio: 0, probability: "0.97"},
            {payoutMultiplier: 200, weight: "250000000000000000", ratio: 2, probability: "0.025"},
            {payoutMultiplier: 500, weight: "50000000000000000", ratio: 5, probability: "0.005"},
        ]);
        const byCategory = new Map(mode.eventClassificationBreakdown.map((entry) => [entry.category, entry]));
        expect(byCategory.get("reveal")).toEqual({category: "reveal", occurrenceFrequency: "1", averageOccurrencesPerOutcome: "1"});
        expect(byCategory.get("win")?.occurrenceFrequency).toBe("0.03");
        expect(byCategory.get("feature")?.occurrenceFrequency).toBe("0.005");
    });

    it("produces numerically identical -- not merely close -- weighted metrics whether the weights are small integers or scaled to uint64 magnitude", () => {
        // The uint64-scale test above asserts each metric with toBeCloseTo, which would still pass if the bigint
        // ratio conversion drifted by an ulp. This proves the stronger claim its comment makes: scaling every weight
        // by 1e16 (total 1e19, above Number.MAX_SAFE_INTEGER, every weight inside uint64) reproduces the small-integer
        // doubles *exactly*, for this fixture; this does not imply universally lossless numeric moments.
        const smallInteger = handComputableReadResult();
        const [smallMode] = smallInteger.modes;
        const scaled: StakeEngineOutcomeSourceReadResult = {
            ...smallInteger,
            modes: [{...smallMode, outcomes: smallMode.outcomes.map((outcome) => ({...outcome, weight: BigInt(outcome.weight as number) * BigInt("10000000000000000")}))}],
        };

        const [smallAnalysis] = new StakeEngineStandaloneAnalyzer().analyze(smallInteger).modes;
        const [scaledAnalysis] = new StakeEngineStandaloneAnalyzer().analyze(scaled).modes;

        expect(scaledAnalysis.totalWeight).toBe("10000000000000000000");
        // Byte-for-byte identical doubles, asserted with strict === via toBe, for every weighted metric.
        expect(scaledAnalysis.rtp).toBe(smallAnalysis.rtp);
        expect(scaledAnalysis.hitFrequency).toBe(smallAnalysis.hitFrequency);
        expect(scaledAnalysis.zeroWinFrequency).toBe(smallAnalysis.zeroWinFrequency);
        expect(scaledAnalysis.variance).toBe(smallAnalysis.variance);
        expect(scaledAnalysis.standardDeviation).toBe(smallAnalysis.standardDeviation);
        expect(scaledAnalysis.maxWinProbability).toBe(smallAnalysis.maxWinProbability);
    });

    it("emits a deterministic 40-place decimal for a non-terminating fraction rather than silently rounding it into a number", () => {
        // Three equal uint64-scale weights: each probability is exactly 1/3, which no float and no finite terminating
        // decimal can represent. The analyzer must expose the canonical 40-place repeating decimal.
        const oneThirdWeight = BigInt("1000000000000000000");
        const analysis = new StakeEngineStandaloneAnalyzer().analyze({
            stakeDir: "/fake/stake-dir",
            issues: [],
            modes: [
                {
                    modeName: "base",
                    cost: 1,
                    outcomes: [
                        {id: 0, weight: oneThirdWeight, payoutMultiplier: 0, ratio: 0, events: [{index: 0, type: "reveal"}]},
                        {id: 1, weight: oneThirdWeight, payoutMultiplier: 100, ratio: 1, events: [{index: 0, type: "win", amount: 100}]},
                        {id: 2, weight: oneThirdWeight, payoutMultiplier: 300, ratio: 3, events: [{index: 0, type: "win", amount: 300}]},
                    ],
                },
            ],
        });

        const [mode] = analysis.modes;
        expect(mode.totalWeight).toBe("3000000000000000000");
        const expectedThird = "0." + "3".repeat(40);
        expect(mode.payoutDistribution.map((bucket) => bucket.probability)).toEqual([expectedThird, expectedThird, expectedThird]);
    });

    it.each([
        ["a bigint above uint64 max", BigInt("18446744073709551616")],
        ["a zero bigint", BigInt(0)],
        ["a negative bigint", BigInt(-1)],
        ["an unsafe-integer number", Number.MAX_SAFE_INTEGER + 2],
        ["a non-positive number", 0],
    ])("rejects %s weight instead of silently truncating it to a lossy value", (_label, badWeight) => {
        const readResult: StakeEngineOutcomeSourceReadResult = {
            stakeDir: "/fake/stake-dir",
            issues: [],
            modes: [
                {
                    modeName: "base",
                    cost: 1,
                    outcomes: [{id: 0, weight: badWeight, payoutMultiplier: 0, ratio: 0, events: [{index: 0, type: "reveal"}]}],
                },
            ],
        };

        expect(() => new StakeEngineStandaloneAnalyzer().analyze(readResult)).toThrow(/uint64/);
    });

    it("accepts a weight at exactly uint64 max as a valid, exact total", () => {
        const uint64Max = BigInt("18446744073709551615");
        const analysis = new StakeEngineStandaloneAnalyzer().analyze({
            stakeDir: "/fake/stake-dir",
            issues: [],
            modes: [
                {
                    modeName: "base",
                    cost: 1,
                    outcomes: [
                        {id: 0, weight: uint64Max, payoutMultiplier: 0, ratio: 0, events: [{index: 0, type: "reveal"}]},
                        {id: 1, weight: BigInt(5), payoutMultiplier: 100, ratio: 1, events: [{index: 0, type: "win", amount: 100}]},
                    ],
                },
            ],
        });

        const [mode] = analysis.modes;
        expect(mode.totalWeight).toBe((uint64Max + BigInt(5)).toString());
        expect(mode.outcomeCount).toBe(2);
    });

    it("accumulates totalWeight exactly when each individual weight is a safe-integer number but their sum crosses above Number.MAX_SAFE_INTEGER", () => {
        // Every other uint64 test hands the analyzer already-large *bigint* weights; here each weight is a plain
        // safe-integer *number* on its own, and only their sum overflows Number.MAX_SAFE_INTEGER. Summed in a JS
        // number the running total would stick at 2^53 (9007199254740991 + 1 + 1 === 9007199254740992), losing the
        // final unit. The bigint accumulation must instead land on the exact 9007199254740993 and emit it as a
        // canonical string, proving the total is accrued in bigint rather than in a lossy number.
        const maxSafe = Number.MAX_SAFE_INTEGER;
        const analysis = new StakeEngineStandaloneAnalyzer().analyze({
            stakeDir: "/fake/stake-dir",
            issues: [],
            modes: [
                {
                    modeName: "base",
                    cost: 1,
                    outcomes: [
                        {id: 0, weight: maxSafe, payoutMultiplier: 0, ratio: 0, events: [{index: 0, type: "reveal"}]},
                        {id: 1, weight: 1, payoutMultiplier: 100, ratio: 1, events: [{index: 0, type: "win", amount: 100}]},
                        {id: 2, weight: 1, payoutMultiplier: 200, ratio: 2, events: [{index: 0, type: "win", amount: 200}]},
                    ],
                },
            ],
        });

        const [mode] = analysis.modes;
        expect(mode.totalWeight).toBe("9007199254740993");
        expect(typeof mode.totalWeight).toBe("string");
        expect(mode.outcomeCount).toBe(3);
        // The two unit-weight winning outcomes are 1/9007199254740993 each -- an exact fraction whose denominator
        // is above Number.MAX_SAFE_INTEGER, so the analyzer must expose it as a canonical decimal string, not a float.
        const oneOverTotal = mode.payoutDistribution.find((bucket) => bucket.payoutMultiplier === 100)?.probability;
        expect(typeof oneOverTotal).toBe("string");
        expect(mode.payoutDistribution.every((bucket) => typeof bucket.probability === "string")).toBe(true);
    });

    it("keeps uint64 weights exact and emits canonical decimal probabilities when the total exceeds Number.MAX_SAFE_INTEGER", () => {
        const winWeight = BigInt("9007199254740993");
        const analysis = new StakeEngineStandaloneAnalyzer().analyze({
            stakeDir: "/fake/stake-dir",
            issues: [],
            modes: [
                {
                    modeName: "base",
                    cost: 1,
                    outcomes: [
                        {id: 0, weight: BigInt(9) * winWeight, payoutMultiplier: 0, ratio: 0, events: [{index: 0, type: "reveal"}]},
                        {id: 1, weight: winWeight, payoutMultiplier: 100, ratio: 1, events: [{index: 0, type: "win", amount: 100}]},
                    ],
                },
            ],
        });

        const [mode] = analysis.modes;
        expect(mode.totalWeight).toBe("90071992547409930");
        expect(mode.payoutDistribution.every((bucket) => typeof bucket.probability === "string")).toBe(true);
        expect(mode.eventClassificationBreakdown.every((category) => typeof category.occurrenceFrequency === "string")).toBe(true);
        // Number(winWeight) / Number(totalWeight) is 0.09999999999999998 because each bigint is rounded
        // independently. Magnitude-aware ratio conversion preserves the existing binary64 one-tenth result.
        expect(mode.rtp).toBe(0.1);
        expect(mode.hitFrequency).toBe(0.1);
    });
});

it("preserves the 2^64-total rare win and agrees with its bounded decimal distribution", () => {
    const mode = new StakeEngineStandaloneAnalyzer().analyze(rareStakeSource()).modes[0];
    expectRareMetrics(mode);
    expect(mode.hitFrequency).toBe(5.421010862427522e-20);
    expect(mode.rtp).toBe(1.0842021724855044e-19);
    expect(mode.variance).toBe(2.168404344971009e-19);
    expect(mode.standardDeviation).toBe(4.656612873077393e-10);
    expect(mode.totalWeight).toBe("18446744073709551616");
    expect(mode.payoutDistribution.map((bucket) => bucket.weight)).toEqual(["18446744073709551615", 1]);
    expectRelative(Number(mode.payoutDistribution[1].probability), mode.hitFrequency);
    const mean = mode.payoutDistribution.reduce((sum, bucket) => sum + Number(bucket.probability) * (bucket.ratio ?? 0), 0);
    const variance = mode.payoutDistribution.reduce((sum, bucket) => sum + Number(bucket.probability) * ((bucket.ratio ?? 0) - mean) ** 2, 0);
    expectRelative(mean, mode.rtp);
    expectRelative(variance, mode.variance);
    const feature = mode.eventClassificationBreakdown.find((entry) => entry.category === "feature")!;
    expectRelative(Number(feature.occurrenceFrequency), RARE_PROBABILITY);
    expectRelative(Number(feature.averageOccurrencesPerOutcome), 2 * RARE_PROBABILITY);
    expect(JSON.parse(JSON.stringify(mode))).toEqual(mode);
});

it("keeps duplicate bucket and repeated event sums exact beyond UInt64", () => {
    const source = rareStakeSource();
    const outcomes = source.modes[0].outcomes;
    const duplicated = {...source, modes: [{...source.modes[0], outcomes: [outcomes[0], {...outcomes[0], id: 2}, outcomes[1]]}]};
    const mode = new StakeEngineStandaloneAnalyzer().analyze(duplicated).modes[0];
    expect(mode.totalWeight).toBe((BigInt(2) * UINT64_MAX + BigInt(1)).toString());
    expect(mode.payoutDistribution[0].weight).toBe((BigInt(2) * UINT64_MAX).toString());
    expectRelative(mode.hitFrequency, 1 / Number(BigInt(2) * UINT64_MAX + BigInt(1)));
});

it("preserves rare losses, a rare neighboring payout's centered variance, and constant payout zero variance", () => {
    const source = rareStakeSource();
    const analyze = (payouts: number[]) => new StakeEngineStandaloneAnalyzer().analyze({...source, modes: [{...source.modes[0], outcomes: source.modes[0].outcomes.map((outcome, i) => ({...outcome, payoutMultiplier: payouts[i] * 100, ratio: payouts[i]}))}]}).modes[0];
    const loss = analyze([2, 0]);
    expectRelative(loss.zeroWinFrequency, RARE_PROBABILITY);
    expectRelative(loss.variance, 4 * RARE_PROBABILITY);
    const neighbor = analyze([2, 3]);
    expectRelative(neighbor.variance, RARE_PROBABILITY);
    expectRelative(neighbor.maxWinProbability, RARE_PROBABILITY);
    expect(analyze([2, 2]).variance).toBe(0);
});

it("rejects an empty direct-call mode and numerical failures while allowing no modes", () => {
    const source = rareStakeSource();
    expect(() => new StakeEngineStandaloneAnalyzer().analyze({...source, modes: [{...source.modes[0], outcomes: []}]})).toThrow(/positive total weight/);
    expect(new StakeEngineStandaloneAnalyzer().analyze({...source, modes: []}).modes).toEqual([]);
    expect(() => new StakeEngineStandaloneAnalyzer().analyze({...source, modes: [{...source.modes[0], outcomes: [{...source.modes[0].outcomes[0], ratio: Infinity}]}]})).toThrow(/not finite/);
});

it.each([-1, 0.5, NaN, Infinity, -Infinity])("rejects invalid numeric weight %s", (weight) => {
    const source = rareStakeSource();
    expect(() => new StakeEngineStandaloneAnalyzer().analyze({...source, modes: [{...source.modes[0], outcomes: [{...source.modes[0].outcomes[0], weight}]}]})).toThrow(/weight/);
});

it.each([1, Number.MAX_SAFE_INTEGER, UINT64_MAX])("accepts weight boundary %s", (weight) => {
    const source = rareStakeSource();
    const mode = new StakeEngineStandaloneAnalyzer().analyze({...source, modes: [{...source.modes[0], outcomes: [{...source.modes[0].outcomes[0], weight}]}]}).modes[0];
    expect(BigInt(mode.totalWeight)).toBe(BigInt(weight));
    expect(mode.hitFrequency).toBe(0);
    expect(mode.variance).toBe(0);
});

it("keeps dominant repeated-event count sums above UInt64 and caps terminating decimals at 40 places", () => {
    const source = rareStakeSource();
    const repeated = {...source, modes: [{...source.modes[0], outcomes: source.modes[0].outcomes.map((outcome) => ({...outcome, events: [{index: 0, type: "bonus"}, {index: 1, type: "bonus"}]}))}]};
    const mode = new StakeEngineStandaloneAnalyzer().analyze(repeated).modes[0];
    expect(mode.eventClassificationBreakdown).toEqual([{category: "feature", occurrenceFrequency: "1", averageOccurrencesPerOutcome: "2"}]);
    // 2^-64 terminates after 64 decimal places; the display contract deliberately caps it at 40.
    expect(mode.payoutDistribution[1].probability).toBe("0.0000000000000000000542101086242752217003");
});

it("retains rare wins when the winning outcome precedes the dominant loss", () => {
    const source = rareStakeSource();
    const reversed = {...source, modes: [{...source.modes[0], outcomes: [...source.modes[0].outcomes].reverse()}]};
    expectRareMetrics(new StakeEngineStandaloneAnalyzer().analyze(reversed).modes[0]);
});
