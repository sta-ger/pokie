import {RandomGameBlueprintGenerator} from "pokie";

// RandomGameBlueprintGenerator.test.ts checks reproducibility ("same seed -> toEqual") and structural
// invariants (bounds, validator cleanliness) across many seeds, but never pins one seed's full literal
// output. This locks in the exact blueprint a known seed produces end-to-end -- manifest, reel/symbol
// counts, paytable, symbol weights, and provenance -- so a change to the default strategy's internals
// that still satisfies the structural invariants but silently alters actual output gets caught.
describe("RandomGameBlueprintGenerator golden seeds", () => {
    test("seed 42 always produces the exact same blueprint", () => {
        expect(new RandomGameBlueprintGenerator().generate({seed: 42})).toEqual({
            blueprint: {
                manifest: {
                    id: "feral-rampaging-pantheon",
                    name: "Feral Rampaging Pantheon",
                    version: "0.1.0",
                    description: "Randomly generated video slot (seed 42).",
                },
                reels: 5,
                rows: 3,
                symbols: ["10", "A", "7", "Q", "8", "J", "K", "9"],
                paytable: {
                    "7": {"3": 6, "4": 12, "5": 18},
                    "8": {"3": 4, "4": 8, "5": 12},
                    "9": {"3": 1, "4": 2, "5": 3},
                    "10": {"3": 8, "4": 16, "5": 24},
                    A: {"3": 7, "4": 14, "5": 21},
                    Q: {"3": 5, "4": 10, "5": 15},
                    J: {"3": 3, "4": 6, "5": 9},
                    K: {"3": 2, "4": 4, "5": 6},
                },
                symbolWeights: {"7": 3, "8": 5, "9": 8, "10": 1, A: 2, Q: 4, J: 6, K: 7},
                availableBets: [1, 2, 5, 10],
            },
            seed: 42,
            provenance: {generatorVersion: "1.0.0", strategy: "default-line-pay", seed: 42},
        });
    });
});
