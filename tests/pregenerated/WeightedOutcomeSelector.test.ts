import {
    SeededWeightedOutcomeRandomSource,
    WeightedOutcomeLibrary,
    WeightedOutcomeRandomSource,
    WeightedOutcomeSelectionError,
    WeightedOutcomeSelector,
    buildWeightedOutcomeLibrary,
} from "pokie";
import {artifactWith} from "../weightedoutcome/WeightedOutcomeTestFixtures.js";

function fixedIntSource(value: number): WeightedOutcomeRandomSource {
    return {nextInt: () => value};
}

function libraryOf(weights: {id: string; weight: number; totalWin: number}[]): WeightedOutcomeLibrary<string> {
    return buildWeightedOutcomeLibrary({
        libraryId: "selector-test",
        outcomes: weights.map(({id, weight, totalWin}) => ({
            id,
            weight,
            artifact: artifactWith({roundId: id, totalWin}),
        })),
    });
}

describe("WeightedOutcomeSelector", () => {
    it("selects the outcome whose exact integer cumulative-weight range contains the drawn point", () => {
        const library = libraryOf([
            {id: "a", weight: 70, totalWin: 0},
            {id: "b", weight: 25, totalWin: 5},
            {id: "c", weight: 5, totalWin: 100},
        ]);
        const selector = new WeightedOutcomeSelector();

        // totalWeight = 100; cumulative ranges: a=[0,70), b=[70,95), c=[95,100)
        expect(selector.select(library, fixedIntSource(0)).id).toBe("a");
        expect(selector.select(library, fixedIntSource(69)).id).toBe("a");
        expect(selector.select(library, fixedIntSource(70)).id).toBe("b");
        expect(selector.select(library, fixedIntSource(94)).id).toBe("b");
        expect(selector.select(library, fixedIntSource(95)).id).toBe("c");
        expect(selector.select(library, fixedIntSource(99)).id).toBe("c");
    });

    it("passes the library's own total weight as the exclusive upper bound", () => {
        const library = libraryOf([
            {id: "a", weight: 3, totalWin: 0},
            {id: "b", weight: 7, totalWin: 0},
        ]);
        const selector = new WeightedOutcomeSelector();
        let requestedBound: number | undefined;
        const source: WeightedOutcomeRandomSource = {
            nextInt: (exclusiveUpperBound) => {
                requestedBound = exclusiveUpperBound;
                return 0;
            },
        };

        selector.select(library, source);
        expect(requestedBound).toBe(10);
    });

    it("selects a rare outcome (weight 1) that sits at the very end of a large library exactly at its boundary", () => {
        const library = libraryOf([
            {id: "common", weight: 999999, totalWin: 0},
            {id: "ultra-rare", weight: 1, totalWin: 1000000},
        ]);
        const selector = new WeightedOutcomeSelector();

        // totalWeight = 1000000; "ultra-rare" only occupies the single point at index 999999.
        expect(selector.select(library, fixedIntSource(999998)).id).toBe("common");
        expect(selector.select(library, fixedIntSource(999999)).id).toBe("ultra-rare");
    });

    it("selects correctly from a library whose total weight exceeds 2^32", () => {
        const aboveThirtyTwoBits = 2 ** 32 + 500;
        const library = libraryOf([
            {id: "a", weight: aboveThirtyTwoBits, totalWin: 0},
            {id: "b", weight: 250, totalWin: 10},
        ]);
        const selector = new WeightedOutcomeSelector();

        // totalWeight = 2^32 + 750; "a" occupies [0, 2^32+500), "b" occupies [2^32+500, 2^32+750) — a
        // point drawn well above 2^32 must still land in the right outcome, proving the walk isn't
        // silently truncated to 32 bits anywhere.
        expect(selector.select(library, fixedIntSource(aboveThirtyTwoBits - 1)).id).toBe("a");
        expect(selector.select(library, fixedIntSource(aboveThirtyTwoBits)).id).toBe("b");
        expect(selector.select(library, fixedIntSource(aboveThirtyTwoBits + 249)).id).toBe("b");
    });

    it("is deterministic given the same seeded random source sequence", () => {
        const library = libraryOf([
            {id: "a", weight: 1, totalWin: 0},
            {id: "b", weight: 1, totalWin: 1},
            {id: "c", weight: 1, totalWin: 2},
        ]);
        const selector = new WeightedOutcomeSelector();

        const drawWith = (seed: string): string[] => {
            const source = new SeededWeightedOutcomeRandomSource(seed);
            return Array.from({length: 10}, () => selector.select(library, source).id);
        };

        expect(drawWith("seed-42")).toEqual(drawWith("seed-42"));
    });

    it("draws proportionally to weight over many samples", () => {
        const library = libraryOf([
            {id: "common", weight: 90, totalWin: 0},
            {id: "rare", weight: 10, totalWin: 50},
        ]);
        const selector = new WeightedOutcomeSelector();
        const source = new SeededWeightedOutcomeRandomSource("seed-1234");

        const counts = {common: 0, rare: 0};
        const samples = 20000;
        for (let i = 0; i < samples; i++) {
            const id = selector.select(library, source).id as "common" | "rare";
            counts[id]++;
        }

        expect(counts.common / samples).toBeGreaterThan(0.85);
        expect(counts.common / samples).toBeLessThan(0.95);
    });

    it("never mutates or copies the selected outcome's canonical artifact", () => {
        const library = libraryOf([{id: "only", weight: 1, totalWin: 3}]);
        const selector = new WeightedOutcomeSelector();

        const outcome = selector.select(library, fixedIntSource(0));
        expect(outcome.artifact).toBe(library.outcomes[0].artifact);
    });

    it("throws WeightedOutcomeSelectionError for a library with no outcomes", () => {
        const emptyLibrary = {schemaVersion: 1, libraryId: "empty", outcomes: []} as WeightedOutcomeLibrary<string>;
        const selector = new WeightedOutcomeSelector();

        expect(() => selector.select(emptyLibrary, fixedIntSource(0))).toThrow(WeightedOutcomeSelectionError);
    });

    it("throws WeightedOutcomeSelectionError for a non-integer or non-positive weight", () => {
        const selector = new WeightedOutcomeSelector();
        const fractionalWeightLibrary = {
            schemaVersion: 1,
            libraryId: "fractional",
            outcomes: [{id: "a", weight: 0.5, artifact: artifactWith({roundId: "a", totalWin: 0})}],
        } as WeightedOutcomeLibrary<string>;

        expect(() => selector.select(fractionalWeightLibrary, fixedIntSource(0))).toThrow(WeightedOutcomeSelectionError);
    });

    it("throws WeightedOutcomeSelectionError when the random source violates its [0, totalWeight) contract", () => {
        const library = libraryOf([{id: "a", weight: 10, totalWin: 0}]);
        const selector = new WeightedOutcomeSelector();

        expect(() => selector.select(library, fixedIntSource(10))).toThrow(WeightedOutcomeSelectionError);
        expect(() => selector.select(library, fixedIntSource(-1))).toThrow(WeightedOutcomeSelectionError);
        expect(() => selector.select(library, fixedIntSource(1.5))).toThrow(WeightedOutcomeSelectionError);
    });
});
