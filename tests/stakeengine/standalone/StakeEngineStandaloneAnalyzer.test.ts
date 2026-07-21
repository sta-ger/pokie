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
            {payoutMultiplier: 0, ratio: 0, probability: 0.97},
            {payoutMultiplier: 200, ratio: 2, probability: 0.025},
            {payoutMultiplier: 500, ratio: 5, probability: 0.005},
        ]);
        const totalProbability = mode.payoutDistribution.reduce((sum, bucket) => sum + bucket.probability, 0);
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
});
