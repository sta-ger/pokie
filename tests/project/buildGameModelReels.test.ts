import {buildGameModelReels, convertSharedWeightsToReelStrips} from "../../src/project/buildGameModelReels.js";
import type {GameBlueprint} from "../../src/generated/GameBlueprint.js";

const BASE_BLUEPRINT: GameBlueprint = {
    manifest: {id: "a", name: "A", version: "1.0.0"},
    reels: 2,
    rows: 3,
    symbols: ["A", "B", "S"],
    wilds: ["A"],
    scatters: ["S"],
    paytable: {A: {3: 5}, B: {3: 2}},
};

describe("buildGameModelReels", () => {
    it("exposes literal reelStrips as real, fixed per-reel strips with their own index/circularity/stacks/specials, and a game window read off them at stop 0", () => {
        const result = buildGameModelReels({...BASE_BLUEPRINT, reelStrips: [["B", "B", "A", "S"], ["A", "S", "B"]]});

        expect(result.generationMode).toEqual("reelStrips");
        expect(result.sharedWeightsSample).toBeUndefined();
        expect(result.reels).toHaveLength(2);

        const reel0 = result.reels[0];
        expect(reel0.source).toEqual("literal");
        if (reel0.source !== "literal" || !("positions" in reel0)) {
            throw new Error("expected a resolved literal reel");
        }
        expect(reel0.positions).toEqual([
            {index: 0, symbolId: "B", isWild: false, isScatter: false, locked: false, stackSize: 2},
            {index: 1, symbolId: "B", isWild: false, isScatter: false, locked: false, stackSize: 2},
            {index: 2, symbolId: "A", isWild: true, isScatter: false, locked: false, stackSize: 1},
            {index: 3, symbolId: "S", isWild: false, isScatter: true, locked: false, stackSize: 1},
        ]);
        expect(reel0.analysis.length).toEqual(4);
        expect(reel0.analysis.symbolCounts).toEqual({B: 2, A: 1, S: 1});

        // Game window at stop 0, [reelIndex][rowIndex] -- wraps reel 1 (only 3 symbols) around to its
        // own start once rows (3) would run past its own end... reel 1 has exactly 3 symbols so no wrap
        // is exercised there, but reel 0 (4 symbols, 3 rows) reads its own first 3 symbols verbatim.
        expect(result.gameWindow).toEqual({
            reels: 2,
            rows: 3,
            wrapsAround: true,
            grid: [
                [
                    {symbolId: "B", isWild: false, isScatter: false},
                    {symbolId: "B", isWild: false, isScatter: false},
                    {symbolId: "A", isWild: true, isScatter: false},
                ],
                [
                    {symbolId: "A", isWild: true, isScatter: false},
                    {symbolId: "S", isWild: false, isScatter: true},
                    {symbolId: "B", isWild: false, isScatter: false},
                ],
            ],
        });
    });

    it("wraps the game window around a reel shorter than the configured rows, via the strip's own circular resolution", () => {
        const result = buildGameModelReels({...BASE_BLUEPRINT, reels: 1, reelStrips: [["A", "B"]]});
        expect(result.gameWindow.grid).toEqual([
            [
                {symbolId: "A", isWild: true, isScatter: false},
                {symbolId: "B", isWild: false, isScatter: false},
                {symbolId: "A", isWild: true, isScatter: false},
            ],
        ]);
    });

    it("resolves reelStripGeneration through the real generator -- literal entries pass through, generated entries expose their own diagnostics and locked positions", () => {
        const result = buildGameModelReels({
            ...BASE_BLUEPRINT,
            reelStripGeneration: [
                {type: "literal", strip: ["A", "B"]},
                {type: "generated", length: 3, symbolCounts: {A: 1, B: 2}, seed: 42, lockedPositions: {0: "A"}},
            ],
        });

        expect(result.generationMode).toEqual("reelStripGeneration");
        expect(result.reels).toHaveLength(2);

        const literalReel = result.reels[0];
        expect(literalReel.source).toEqual("literal");

        const generatedReel = result.reels[1];
        expect(generatedReel.source).toEqual("generated");
        if (!("positions" in generatedReel)) {
            throw new Error("expected the generated reel to resolve successfully");
        }
        expect(generatedReel.positions).toHaveLength(3);
        expect(generatedReel.positions[0]).toEqual({index: 0, symbolId: "A", isWild: true, isScatter: false, locked: true, stackSize: 1});
        expect(generatedReel.analysis.symbolCounts).toEqual({A: 1, B: 2});
        expect(generatedReel.generationDiagnostics).toBeDefined();
        expect(generatedReel.generationDiagnostics!.some((diagnostic) => diagnostic.accepted)).toBe(true);
    });

    it("reports an unresolved generated reel with its own failure reason instead of a fabricated strip", () => {
        const result = buildGameModelReels({
            ...BASE_BLUEPRINT,
            reels: 1,
            reelStripGeneration: [{type: "generated", length: 2, symbolCounts: {A: 3}, seed: 1}],
        });

        expect(result.reels).toHaveLength(1);
        const reel = result.reels[0];
        expect(reel.source).toEqual("generated");
        expect("positions" in reel).toBe(false);
        if ("positions" in reel) {
            throw new Error("expected an unresolved reel");
        }
        expect(reel.reason.length).toBeGreaterThan(0);
        expect(reel.generationDiagnostics.length).toBeGreaterThan(0);
        expect(result.gameWindow.grid).toEqual([[]]);
    });

    it("never shows a fake fixed strip for symbolWeights -- instead a reproducible, independently-generated sample per reel, plus the real weights-to-counts conversion diagnostic", () => {
        const result = buildGameModelReels({...BASE_BLUEPRINT, reels: 2, symbolWeights: {A: 1, B: 3}});

        expect(result.generationMode).toEqual("symbolWeights");
        expect(result.sharedWeightsSample).toBeDefined();
        expect(result.sharedWeightsSample!.weights).toEqual({A: 1, B: 3});
        expect(result.sharedWeightsSample!.sampleLength).toEqual(4);
        expect(result.sharedWeightsSample!.conversion.counts).toEqual({A: 1, B: 3});

        expect(result.reels).toHaveLength(2);
        for (const reel of result.reels) {
            expect(reel.source).toEqual("sample");
            if (!("positions" in reel)) {
                throw new Error("expected a resolved sample reel");
            }
            expect(reel.positions).toHaveLength(4);
            expect(reel.analysis.symbolCounts).toEqual({A: 1, B: 3});
        }

        // Independently generated per reel (different seeds) -- reel 0 and reel 1 are not required to
        // be identical, matching "applied uniformly (independently shuffled) to every reel".
        const reel0 = result.reels[0];
        const reel1 = result.reels[1];
        if (!("positions" in reel0) || !("positions" in reel1)) {
            throw new Error("expected resolved sample reels");
        }
        expect(result.sharedWeightsSample!.seed).toEqual(1);

        // Reproducible: the exact same blueprint always produces the exact same sample.
        const again = buildGameModelReels({...BASE_BLUEPRINT, reels: 2, symbolWeights: {A: 1, B: 3}});
        expect(again.reels).toEqual(result.reels);
        expect(again.sharedWeightsSample).toEqual(result.sharedWeightsSample);
    });

    it("falls back to the engine's own built-in default weighting (15 non-special, 5 wild, 3 scatter) when none of reelStrips/reelStripGeneration/symbolWeights is set", () => {
        const result = buildGameModelReels({...BASE_BLUEPRINT, reels: 1});

        expect(result.generationMode).toEqual("default");
        expect(result.sharedWeightsSample!.weights).toEqual({A: 5, B: 15, S: 3});
        expect(result.sharedWeightsSample!.sampleLength).toEqual(23);
        expect(result.reels).toHaveLength(1);
        const reel = result.reels[0];
        if (!("positions" in reel)) {
            throw new Error("expected a resolved sample reel");
        }
        expect(reel.analysis.symbolCounts).toEqual({A: 5, B: 15, S: 3});
    });

    it("re-rolls the shared-weights sample deterministically for a given sharedWeightsSampleSeed -- a different seed still reproduces the exact same sample when asked again", () => {
        const blueprint: GameBlueprint = {...BASE_BLUEPRINT, reels: 2, symbolWeights: {A: 1, B: 3}};
        const defaultSeed = buildGameModelReels(blueprint);
        const rerolled = buildGameModelReels(blueprint, {sharedWeightsSampleSeed: 99});

        expect(rerolled.sharedWeightsSample!.seed).toEqual(99);
        expect(rerolled.sharedWeightsSample!.weights).toEqual(defaultSeed.sharedWeightsSample!.weights);
        expect(rerolled).not.toEqual(defaultSeed);

        const rerolledAgain = buildGameModelReels(blueprint, {sharedWeightsSampleSeed: 99});
        expect(rerolledAgain).toEqual(rerolled);
    });

    describe("convertSharedWeightsToReelStrips", () => {
        it("returns exactly the same per-reel sample strips buildGameModelReels itself already shows for symbolWeights, never a second, independently re-derived conversion", () => {
            const blueprint: GameBlueprint = {...BASE_BLUEPRINT, reels: 2, symbolWeights: {A: 1, B: 3}};
            const sampleReels = buildGameModelReels(blueprint).reels;
            const stripsFromSample = sampleReels.map((reel) => ("positions" in reel ? reel.positions.map((position) => position.symbolId) : []));

            expect(convertSharedWeightsToReelStrips(blueprint)).toEqual(stripsFromSample);
        });

        it("converts the engine's own built-in default weighting the same way, when neither reelStrips/reelStripGeneration/symbolWeights is set", () => {
            const blueprint: GameBlueprint = {...BASE_BLUEPRINT, reels: 1};
            const sampleReels = buildGameModelReels(blueprint).reels;
            const stripsFromSample = sampleReels.map((reel) => ("positions" in reel ? reel.positions.map((position) => position.symbolId) : []));

            expect(convertSharedWeightsToReelStrips(blueprint)).toEqual(stripsFromSample);
        });

        it("converts exactly the re-rolled sample when given the same seed a caller's own 'New sample' re-roll used, not the default one", () => {
            const blueprint: GameBlueprint = {...BASE_BLUEPRINT, reels: 2, symbolWeights: {A: 1, B: 3}};
            const rerolledSampleReels = buildGameModelReels(blueprint, {sharedWeightsSampleSeed: 99}).reels;
            const stripsFromRerolledSample = rerolledSampleReels.map((reel) => ("positions" in reel ? reel.positions.map((position) => position.symbolId) : []));

            expect(convertSharedWeightsToReelStrips(blueprint, 99)).toEqual(stripsFromRerolledSample);
            expect(convertSharedWeightsToReelStrips(blueprint, 99)).not.toEqual(convertSharedWeightsToReelStrips(blueprint));
        });
    });
});
