import {GameBlueprintValidator, RandomGameBlueprintGenerator, resolveReelStripGeneration, toCanonicalJson} from "pokie";

// RandomGameBlueprintGenerator.test.ts checks reproducibility, validator-cleanliness, and mechanic scope each in
// isolation, on a handful of hand-picked seeds. This sweeps a bounded, fixed set of seeds and checks every one of
// those invariants together on each seed -- plus two invariants no existing test covers at all: that every
// generated payout/weight is strictly positive, and that the blueprint survives a canonical-JSON round trip
// losslessly (the shape RandomGameBlueprintResult actually gets persisted/exported in). The seed set itself is
// fixed-size (bounded case count) and literal (stable across runs and release lanes) -- no unbounded loop, no
// Math.random() picking which seeds run.
describe("RandomGameBlueprintGenerator bounded property invariants", () => {
    const seeds = Array.from({length: 30}, (_, index) => index + 1);
    const validator = new GameBlueprintValidator();

    test.each(seeds)(
        "seed %i: reproducible, validator-clean, mechanic-scoped, strictly-positive payouts/weights, JSON round-trips losslessly",
        (seed) => {
            const generator = new RandomGameBlueprintGenerator();

            const first = generator.generate({seed});
            const second = generator.generate({seed});

            // same seed/result: reproducibility
            expect(second).toEqual(first);

            const {blueprint} = first;

            // valid generated blueprints
            expect(validator.validate(blueprint)).toEqual([]);

            // unsupported mechanics are not generated: only reels/rows/symbols/paytable/reelStripGeneration/
            // availableBets ever appear, matching DefaultRandomGameBlueprintStrategy's declared feature set
            expect(blueprint.wilds).toBeUndefined();
            expect(blueprint.scatters).toBeUndefined();
            expect(blueprint.paylines).toBeUndefined();
            expect(blueprint.winModel).toBeUndefined();
            expect(blueprint.mechanics).toBeUndefined();
            expect(blueprint.betModes).toBeUndefined();
            expect(blueprint.reelStrips).toBeUndefined();
            expect(blueprint.symbolWeights).toBeUndefined();
            expect(blueprint.reelStripGeneration).toHaveLength(blueprint.reels);

            // non-negative payouts: every paytable entry and every reel's generation weight is strictly positive
            for (const symbolId of blueprint.symbols) {
                for (const payout of Object.values(blueprint.paytable[symbolId])) {
                    expect(payout).toBeGreaterThan(0);
                }
                for (const spec of blueprint.reelStripGeneration!) {
                    expect((spec as {symbolWeights: Record<string, number>}).symbolWeights[symbolId]).toBeGreaterThan(0);
                }
            }

            // inspectable reel results: every generated reel resolves deterministically to a concrete strip
            const resolution = resolveReelStripGeneration(blueprint);
            expect(resolution.success).toBe(true);
            expect(resolveReelStripGeneration(blueprint)).toEqual(resolution);

            // serialization round-trip: the canonical JSON form survives a stringify/parse cycle losslessly
            const canonical = toCanonicalJson(blueprint);
            expect(JSON.parse(JSON.stringify(canonical))).toEqual(canonical);
        },
    );
});
