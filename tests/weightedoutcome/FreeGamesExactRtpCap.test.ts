import {buildWeightedOutcomeLibrary, computeFreeGamesExactRtp} from "@fromstan/pokie";
import {artifactWith} from "./WeightedOutcomeTestFixtures.js";

function triggered(roundId: string, count: number) {
    return artifactWith({roundId, totalWin: 0, featureEvents: [{type: "freeGamesTriggered", data: {count}}]});
}

describe("computeFreeGamesExactRtp with a hard cap", () => {
    it("integrates the exact award distribution up to the total-free-games cap", () => {
        const library = buildWeightedOutcomeLibrary({
            libraryId: "capped-variable-awards",
            outcomes: [
                {id: "award-1", weight: 1, record: triggered("round-1", 1)},
                {id: "award-3", weight: 1, record: triggered("round-3", 3)},
                {id: "no-trigger", weight: 1, record: artifactWith({roundId: "round-none", totalWin: 0})},
            ],
        });

        const result = computeFreeGamesExactRtp(library, 1, 3);

        expect(result.status).toBe("available");
        if (result.status !== "available") throw new Error(result.reason);
        expect(result.method).toBe("additive-retrigger-capped");
        expect(result.maxFreeGames).toBe(3);
        expect(result.triggerProbability).toBeCloseTo(2 / 3, 12);
        expect(result.expectedAward).toBe(2);
        // Exact DP: initial award 1 or 3 (50/50), 2/3 trigger chance per free spin, total cap 3.
        expect(result.expectedFreeSpins).toBeCloseTo(47 / 18, 12);
        expect(result.featureRtp).toBeCloseTo((2 / 3) * (47 / 18), 12);
        expect(result.totalRtp).toBeCloseTo(1 + (2 / 3) * (47 / 18), 12);
    });

    it("keeps a supercritical series finite when a cap is supplied", () => {
        const library = buildWeightedOutcomeLibrary({
            libraryId: "capped-supercritical",
            outcomes: [{id: "award-2", weight: 1, record: triggered("round-2", 2)}],
        });

        expect(computeFreeGamesExactRtp(library, 1).status).toBe("infinite");
        const capped = computeFreeGamesExactRtp(library, 1, 5);
        expect(capped.status).toBe("available");
        if (capped.status !== "available") throw new Error(capped.reason);
        expect(capped.expectedFreeSpins).toBe(5);
        expect(capped.totalRtp).toBe(6);
    });
});
