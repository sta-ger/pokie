import {
    SeededWeightedOutcomeRandomSource,
    WeightedOutcomeLibrary,
    WeightedOutcomeRandomSource,
    WeightedOutcomeSelectionError,
    WeightedOutcomeSelector,
    buildWeightedOutcomeLibrary,
} from "pokie";
import {artifactWith} from "../weightedoutcome/WeightedOutcomeTestFixtures";

function fixedUnitSource(value: number): WeightedOutcomeRandomSource {
    return {nextUnitInterval: () => value};
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
    it("selects the outcome whose cumulative weight range contains the drawn point", () => {
        const library = libraryOf([
            {id: "a", weight: 70, totalWin: 0},
            {id: "b", weight: 25, totalWin: 5},
            {id: "c", weight: 5, totalWin: 100},
        ]);
        const selector = new WeightedOutcomeSelector();

        // totalWeight = 100; cumulative ranges: a=[0,70), b=[70,95), c=[95,100)
        expect(selector.select(library, fixedUnitSource(0)).id).toBe("a");
        expect(selector.select(library, fixedUnitSource(0.69)).id).toBe("a");
        expect(selector.select(library, fixedUnitSource(0.7)).id).toBe("b");
        expect(selector.select(library, fixedUnitSource(0.94)).id).toBe("b");
        expect(selector.select(library, fixedUnitSource(0.95)).id).toBe("c");
        expect(selector.select(library, fixedUnitSource(0.999999)).id).toBe("c");
    });

    it("is deterministic given the same seeded random source sequence", () => {
        const library = libraryOf([
            {id: "a", weight: 1, totalWin: 0},
            {id: "b", weight: 1, totalWin: 1},
            {id: "c", weight: 1, totalWin: 2},
        ]);
        const selector = new WeightedOutcomeSelector();

        const drawWith = (seed: number): string[] => {
            const source = new SeededWeightedOutcomeRandomSource(seed);
            return Array.from({length: 10}, () => selector.select(library, source).id);
        };

        expect(drawWith(42)).toEqual(drawWith(42));
    });

    it("draws proportionally to weight over many samples", () => {
        const library = libraryOf([
            {id: "common", weight: 90, totalWin: 0},
            {id: "rare", weight: 10, totalWin: 50},
        ]);
        const selector = new WeightedOutcomeSelector();
        const source = new SeededWeightedOutcomeRandomSource(1234);

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

        const outcome = selector.select(library, fixedUnitSource(0));
        expect(outcome.artifact).toBe(library.outcomes[0].artifact);
    });

    it("throws WeightedOutcomeSelectionError for a library with no outcomes", () => {
        const emptyLibrary = {schemaVersion: 1, libraryId: "empty", outcomes: []} as WeightedOutcomeLibrary<string>;
        const selector = new WeightedOutcomeSelector();

        expect(() => selector.select(emptyLibrary, fixedUnitSource(0))).toThrow(WeightedOutcomeSelectionError);
    });

    it("throws WeightedOutcomeSelectionError when the random source violates its [0, 1) contract", () => {
        const library = libraryOf([{id: "a", weight: 1, totalWin: 0}]);
        const selector = new WeightedOutcomeSelector();

        expect(() => selector.select(library, fixedUnitSource(1))).toThrow(WeightedOutcomeSelectionError);
        expect(() => selector.select(library, fixedUnitSource(-0.1))).toThrow(WeightedOutcomeSelectionError);
        expect(() => selector.select(library, fixedUnitSource(NaN))).toThrow(WeightedOutcomeSelectionError);
    });
});
