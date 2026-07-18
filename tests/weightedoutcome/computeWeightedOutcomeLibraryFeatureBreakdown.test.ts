import {WinEvaluationResult, buildRoundArtifact, buildWeightedOutcomeLibrary, computeWeightedOutcomeLibraryFeatureBreakdown} from "pokie";
import {testProvenance} from "./WeightedOutcomeTestFixtures.js";

const NO_WIN = new WinEvaluationResult<string>();

describe("computeWeightedOutcomeLibraryFeatureBreakdown", () => {
    it("computes weighted frequency per bet mode and per feature event type", () => {
        const library = buildWeightedOutcomeLibrary({
            libraryId: "lib-breakdown",
            outcomes: [
                {
                    id: "base-no-feature",
                    weight: 60,
                    artifact: buildRoundArtifact({
                        roundId: "r1",
                        provenance: testProvenance,
                        betMode: "base",
                        stake: 1,
                        steps: [{screen: [["A"]], winEvaluationResult: NO_WIN}],
                    }),
                },
                {
                    id: "base-with-free-games",
                    weight: 30,
                    artifact: buildRoundArtifact({
                        roundId: "r2",
                        provenance: testProvenance,
                        betMode: "base",
                        stake: 1,
                        steps: [{screen: [["A"]], winEvaluationResult: NO_WIN}],
                        featureEvents: [{type: "freeGamesTriggered"}],
                    }),
                },
                {
                    // A WeightedOutcomeLibrary requires every outcome to share the same betMode (free-games
                    // rounds are modeled as extra steps on one RoundArtifact, never a second betMode) -- this
                    // outcome models a round that happens to trigger free games as an extra step, still
                    // within the "base" bet mode.
                    id: "base-with-cascade-and-free-games",
                    weight: 10,
                    artifact: buildRoundArtifact({
                        roundId: "r3",
                        provenance: testProvenance,
                        betMode: "base",
                        stake: 1,
                        steps: [{screen: [["A"]], winEvaluationResult: NO_WIN}],
                        featureEvents: [{type: "freeGamesTriggered"}, {type: "cascadeRefill"}],
                    }),
                },
            ],
        });

        const breakdown = computeWeightedOutcomeLibraryFeatureBreakdown(library);

        expect(breakdown.betModes).toEqual([{key: "base", weightedFrequency: 1, outcomeCount: 3}]);
        expect(breakdown.featureEvents).toEqual([
            {key: "cascadeRefill", weightedFrequency: 0.1, outcomeCount: 1},
            {key: "freeGamesTriggered", weightedFrequency: 0.4, outcomeCount: 2},
        ]);
    });

    it("counts a feature event only once per outcome even if it fires on multiple steps", () => {
        const library = buildWeightedOutcomeLibrary({
            libraryId: "lib-dedupe",
            outcomes: [
                {
                    id: "a",
                    weight: 1,
                    artifact: buildRoundArtifact({
                        roundId: "r1",
                        provenance: testProvenance,
                        stake: 1,
                        steps: [
                            {screen: [["A"]], winEvaluationResult: NO_WIN, featureEvents: [{type: "cascadeRefill"}]},
                            {screen: [["A"]], winEvaluationResult: NO_WIN, featureEvents: [{type: "cascadeRefill"}]},
                        ],
                    }),
                },
            ],
        });

        const breakdown = computeWeightedOutcomeLibraryFeatureBreakdown(library);

        expect(breakdown.featureEvents).toEqual([{key: "cascadeRefill", weightedFrequency: 1, outcomeCount: 1}]);
    });

    it("reports only the default bet mode and no feature events for a library that uses neither", () => {
        const library = buildWeightedOutcomeLibrary({
            libraryId: "lib-plain",
            outcomes: [
                {
                    id: "a",
                    weight: 1,
                    artifact: buildRoundArtifact({
                        roundId: "r1",
                        provenance: testProvenance,
                        stake: 1,
                        steps: [{screen: [["A"]], winEvaluationResult: NO_WIN}],
                    }),
                },
            ],
        });

        const breakdown = computeWeightedOutcomeLibraryFeatureBreakdown(library);

        expect(breakdown.featureEvents).toEqual([]);
        expect(breakdown.betModes).toEqual([{key: "base", weightedFrequency: 1, outcomeCount: 1}]);
    });
});
