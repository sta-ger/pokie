import {WeightedOutcomeLibraryAnalyzer, buildWeightedOutcomeLibrary} from "pokie";
import {artifactWithTotalWin} from "./WeightedOutcomeTestFixtures.js";

describe("WeightedOutcomeLibraryAnalyzer", () => {
    it("computes exact weighted statistics for a hand-computable 3-outcome library", () => {
        // weight 70: totalWin 0 (payoutMultiplier 0)
        // weight 25: totalWin 2 (payoutMultiplier 2, stake fixed at 1)
        // weight  5: totalWin 100 (payoutMultiplier 100)
        //
        // totalWeight = 100
        // rtp = (70*0 + 25*2 + 5*100) / 100 = 550/100 = 5.5
        // hitFrequency = (25+5)/100 = 0.3 ; zeroWinFrequency = 0.7
        // variance = [70*(0-5.5)^2 + 25*(2-5.5)^2 + 5*(100-5.5)^2] / 100
        //          = [70*30.25 + 25*12.25 + 5*8930.25] / 100
        //          = [2117.5 + 306.25 + 44651.25] / 100 = 47075/100 = 470.75
        // standardDeviation = sqrt(470.75)
        // maxWin = 100, maxWinProbability = 5/100 = 0.05
        const library = buildWeightedOutcomeLibrary({
            libraryId: "lib-1",
            outcomes: [
                {id: "no-win", weight: 70, artifact: artifactWithTotalWin("r1", 0)},
                {id: "small-win", weight: 25, artifact: artifactWithTotalWin("r2", 2)},
                {id: "jackpot", weight: 5, artifact: artifactWithTotalWin("r3", 100)},
            ],
        });

        const analysis = new WeightedOutcomeLibraryAnalyzer().analyze(library);

        expect(analysis.totalWeight).toBe(100);
        expect(analysis.rtp).toBeCloseTo(5.5, 10);
        expect(analysis.hitFrequency).toBeCloseTo(0.3, 10);
        expect(analysis.zeroWinFrequency).toBeCloseTo(0.7, 10);
        expect(analysis.hitFrequency + analysis.zeroWinFrequency).toBeCloseTo(1, 10);
        expect(analysis.variance).toBeCloseTo(470.75, 10);
        expect(analysis.standardDeviation).toBeCloseTo(Math.sqrt(470.75), 10);
        expect(analysis.maxWin).toBe(100);
        expect(analysis.maxWinProbability).toBeCloseTo(0.05, 10);

        expect(analysis.payoutDistribution).toEqual([
            {payoutMultiplier: 0, probability: 0.7},
            {payoutMultiplier: 2, probability: 0.25},
            {payoutMultiplier: 100, probability: 0.05},
        ]);
        expect(analysis.payoutDistribution.reduce((sum, bucket) => sum + bucket.probability, 0)).toBeCloseTo(1, 10);
    });

    it("merges outcomes that share the same payoutMultiplier into one exact payout distribution bucket", () => {
        const library = buildWeightedOutcomeLibrary({
            libraryId: "lib-2",
            outcomes: [
                {id: "a", weight: 40, artifact: artifactWithTotalWin("r1", 3)},
                {id: "b", weight: 10, artifact: artifactWithTotalWin("r2", 3)},
                {id: "c", weight: 50, artifact: artifactWithTotalWin("r3", 0)},
            ],
        });

        const analysis = new WeightedOutcomeLibraryAnalyzer().analyze(library);

        expect(analysis.payoutDistribution).toHaveLength(2);
        expect(analysis.payoutDistribution).toEqual([
            {payoutMultiplier: 0, probability: 0.5},
            {payoutMultiplier: 3, probability: 0.5},
        ]);
        // rtp = (50*3)/100 = 1.5, matching the merged 3x bucket's combined weight.
        expect(analysis.rtp).toBeCloseTo(1.5, 10);
    });

    it("reports zero variance/standardDeviation and full hit frequency for a library with a single constant outcome", () => {
        const library = buildWeightedOutcomeLibrary({
            libraryId: "lib-3",
            outcomes: [{id: "only", weight: 1, artifact: artifactWithTotalWin("r1", 4)}],
        });

        const analysis = new WeightedOutcomeLibraryAnalyzer().analyze(library);

        expect(analysis.rtp).toBe(4);
        expect(analysis.variance).toBe(0);
        expect(analysis.standardDeviation).toBe(0);
        expect(analysis.hitFrequency).toBe(1);
        expect(analysis.zeroWinFrequency).toBe(0);
        expect(analysis.maxWin).toBe(4);
        expect(analysis.maxWinProbability).toBe(1);
    });

    it("reports zero rtp/hitFrequency for a library where every outcome loses", () => {
        const library = buildWeightedOutcomeLibrary({
            libraryId: "lib-4",
            outcomes: [
                {id: "a", weight: 1, artifact: artifactWithTotalWin("r1", 0)},
                {id: "b", weight: 2, artifact: artifactWithTotalWin("r2", 0)},
            ],
        });

        const analysis = new WeightedOutcomeLibraryAnalyzer().analyze(library);

        expect(analysis.rtp).toBe(0);
        expect(analysis.hitFrequency).toBe(0);
        expect(analysis.zeroWinFrequency).toBe(1);
        expect(analysis.maxWin).toBe(0);
        expect(analysis.maxWinProbability).toBe(1);
        expect(analysis.payoutDistribution).toEqual([{payoutMultiplier: 0, probability: 1}]);
    });

    it("returns a deeply frozen analysis result", () => {
        const library = buildWeightedOutcomeLibrary({
            libraryId: "lib-5",
            outcomes: [{id: "only", weight: 1, artifact: artifactWithTotalWin("r1", 1)}],
        });
        const analysis = new WeightedOutcomeLibraryAnalyzer().analyze(library);

        expect(() => {
            (analysis as {rtp: number}).rtp = 999;
        }).toThrow(TypeError);
    });
});
