import {analyticsEnvelope, observeFeatureAnalytics} from "../../src/simulation/FeatureAnalytics.js";

describe("Feature analytics component conservation", () => {
    test("explains how a custom payout must enter getWinEvaluationResult()", () => {
        expect(() => observeFeatureAnalytics(1, 1, {
            envelope: analyticsEnvelope(),
            source: "test-source",
            logicalEntry: true,
            logicalCompletion: true,
            carriedSubround: false,
            cascadeSteps: 0,
            components: [{type: "line", id: "0", symbol: "A", amount: 0.5, partition: "base"}],
            features: [],
        })).toThrow(/getWinEvaluationResult.*LegacyWinComponent/);
    });
});
