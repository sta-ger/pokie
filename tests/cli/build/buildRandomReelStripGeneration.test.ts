import {GameBlueprintValidator, RandomGameBlueprintGenerator} from "pokie";
import {buildRandomReelStripGeneration} from "../../../cli/build/buildRandomReelStripGeneration.js";

describe("buildRandomReelStripGeneration", () => {
    it("returns exactly one 'generated' entry per reel, targeting the given symbolWeights", () => {
        const spec = buildRandomReelStripGeneration({A: 1, B: 2, C: 3}, 4, 42);

        expect(spec).toHaveLength(4);
        for (const entry of spec) {
            expect(entry).toEqual({type: "generated", length: 6, symbolWeights: {A: 1, B: 2, C: 3}, seed: expect.any(Number)});
        }
    });

    it("gives every reel a distinct, deterministic seed derived from the base seed", () => {
        const spec = buildRandomReelStripGeneration({A: 1, B: 1}, 3, 100);

        expect(spec.map((entry) => (entry as {seed: number}).seed)).toEqual([100, 101, 102]);
    });

    it("embeds into a random blueprint cleanly: zero errors or warnings from the real GameBlueprintValidator", () => {
        const {blueprint, seed} = new RandomGameBlueprintGenerator().generate({seed: 7});
        const symbolWeights = blueprint.symbolWeights!;

        const converted = {...blueprint, reelStripGeneration: buildRandomReelStripGeneration(symbolWeights, blueprint.reels, seed)};
        Reflect.deleteProperty(converted, "symbolWeights");

        const issues = new GameBlueprintValidator().validate(converted);

        expect(issues).toEqual([]);
    });
});
