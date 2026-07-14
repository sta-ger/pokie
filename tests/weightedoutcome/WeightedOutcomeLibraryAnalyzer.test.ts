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

    it("keeps rtp/variance finite when weight*payoutMultiplier would overflow if multiplied before normalizing", () => {
        // Sanity: the raw, unsafe product (weight * payoutMultiplier) really would overflow to Infinity.
        expect(1e308 * 5).toBe(Infinity);

        const library = buildWeightedOutcomeLibrary({
            libraryId: "lib-overflow",
            outcomes: [
                {id: "a", weight: 1e308, artifact: artifactWithTotalWin("r1", 5)},
                {id: "b", weight: 5e307, artifact: artifactWithTotalWin("r2", 2)},
            ],
        });

        const analysis = new WeightedOutcomeLibraryAnalyzer().analyze(library);

        expect(Number.isFinite(analysis.totalWeight)).toBe(true);
        expect(Number.isFinite(analysis.rtp)).toBe(true);
        expect(Number.isFinite(analysis.variance)).toBe(true);
        expect(Number.isFinite(analysis.standardDeviation)).toBe(true);
        // weight ratio is 2:1, so rtp = (2/3)*5 + (1/3)*2 = 4, variance = (2/3)*1 + (1/3)*4 = 2.
        expect(analysis.rtp).toBeCloseTo(4, 5);
        expect(analysis.variance).toBeCloseTo(2, 5);
    });

    it("keeps two payoutMultiplier values closer than 1e-9 apart as separate exact buckets", () => {
        const library = buildWeightedOutcomeLibrary({
            libraryId: "lib-precision",
            outcomes: [
                {id: "a", weight: 1, artifact: artifactWithTotalWin("r1", 2)},
                {id: "b", weight: 1, artifact: artifactWithTotalWin("r2", 2 + 1e-10)},
            ],
        });

        const analysis = new WeightedOutcomeLibraryAnalyzer().analyze(library);

        expect(analysis.payoutDistribution).toHaveLength(2);
        expect(analysis.payoutDistribution[0].payoutMultiplier).toBe(2);
        expect(analysis.payoutDistribution[1].payoutMultiplier).toBe(2 + 1e-10);
        expect(analysis.payoutDistribution[0].probability).toBeCloseTo(0.5, 10);
        expect(analysis.payoutDistribution[1].probability).toBeCloseTo(0.5, 10);
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
