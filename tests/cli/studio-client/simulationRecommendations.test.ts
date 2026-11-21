import {describeStudioSimulationRecommendation} from "../../../cli/studio-client/src/domain/simulationRecommendations.js";

describe("describeStudioSimulationRecommendation", () => {
    it("maps terminal seed advice to the Studio control", () => {
        expect(describeStudioSimulationRecommendation("Run with --seed <seed> (e.g. --seed demo) to make this simulation reproducible."))
            .toBe("Set a seed under Advanced details before running to make this simulation reproducible.");
    });

    it("maps round-count and comparison/export advice without leaving CLI flags", () => {
        expect(describeStudioSimulationRecommendation("Increase --rounds (e.g. 10000+) for more stable RTP/hit-frequency estimates."))
            .toBe("Increase Rounds (e.g. 10000+) for more stable RTP/hit-frequency estimates.");
        expect(describeStudioSimulationRecommendation('Use "pokie diff" to compare this report against a previous run after changing the game\'s math.'))
            .toMatch(/Compare with another run/);
        expect(describeStudioSimulationRecommendation("Save this report as JSON via --out to keep a record you can diff or replay against later."))
            .toBe("Use Export → Download JSON to keep a record you can diff or replay against later.");
    });

    it("leaves unrelated recommendations untouched", () => {
        expect(describeStudioSimulationRecommendation("A future recommendation.")).toBe("A future recommendation.");
    });
});
