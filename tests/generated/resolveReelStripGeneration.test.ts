import {GameBlueprint, resolveReelStripGeneration} from "pokie";

function baseBlueprint(overrides: Partial<GameBlueprint> = {}): GameBlueprint {
    return {
        manifest: {id: "generated-reels", name: "Generated Reels", version: "0.1.0"},
        reels: 3,
        rows: 3,
        symbols: ["A", "B", "W"],
        wilds: ["W"],
        paytable: {A: {3: 5}, B: {3: 3}},
        ...overrides,
    };
}

describe("resolveReelStripGeneration", () => {
    it("is a no-op success when reelStripGeneration is absent", () => {
        const blueprint = baseBlueprint();

        expect(resolveReelStripGeneration(blueprint)).toEqual({success: true});
    });

    it("is a no-op success (no buildInfo) when every entry is literal", () => {
        const blueprint = baseBlueprint({
            reelStripGeneration: [
                {type: "literal", strip: ["A", "B"]},
                {type: "literal", strip: ["A", "W"]},
                {type: "literal", strip: ["B", "W"]},
            ],
        });

        expect(resolveReelStripGeneration(blueprint)).toEqual({success: true});
    });

    it("generates only the \"generated\" reels, leaving literal reels untouched (mixed blueprint)", () => {
        const blueprint = baseBlueprint({
            reelStripGeneration: [
                {type: "literal", strip: ["A", "B", "W"]},
                {type: "generated", length: 10, symbolCounts: {A: 6, B: 3, W: 1}, seed: 1},
                {type: "generated", length: 8, symbolWeights: {A: 5, B: 5, W: 1}, seed: 2},
            ],
        });

        const resolution = resolveReelStripGeneration(blueprint);

        expect(resolution.success).toBe(true);
        if (!resolution.success) {
            return;
        }
        expect(resolution.reelStripGeneration!.reels).toHaveLength(2); // only the 2 generated reels
        expect(resolution.reelStripGeneration!.reels.map((reel) => reel.reelIndex)).toEqual([1, 2]);

        const [reel1, reel2] = resolution.reelStripGeneration!.reels;
        expect(reel1.strip).toHaveLength(10);
        expect(reel2.strip).toHaveLength(8);
    });

    it("each generated reel is deterministic for its own seed, independent of the others", () => {
        const blueprint = baseBlueprint({
            reelStripGeneration: [
                {type: "generated", length: 12, symbolCounts: {A: 6, B: 5, W: 1}, seed: 42},
                {type: "generated", length: 12, symbolCounts: {A: 6, B: 5, W: 1}, seed: 42},
                {type: "literal", strip: ["A"]},
            ],
        });

        const first = resolveReelStripGeneration(blueprint);
        const second = resolveReelStripGeneration(blueprint);

        expect(first.success && second.success).toBe(true);
        if (first.success && second.success) {
            expect(first.reelStripGeneration!.reels.map((reel) => reel.strip)).toEqual(second.reelStripGeneration!.reels.map((reel) => reel.strip));
            // Same seed + same config on two different reels also produces the same strip.
            expect(first.reelStripGeneration!.reels[0].strip).toEqual(first.reelStripGeneration!.reels[1].strip);
        }
    });

    it("records each generated reel's own config, seed, and resulting exact strip", () => {
        const reel0Config = {length: 10, symbolCounts: {A: 6, B: 3, W: 1}, seed: 7};
        const blueprint = baseBlueprint({reelStripGeneration: [{type: "generated", ...reel0Config}, {type: "literal", strip: ["A"]}, {type: "literal", strip: ["B"]}]});

        const resolution = resolveReelStripGeneration(blueprint);

        expect(resolution.success).toBe(true);
        if (!resolution.success) {
            return;
        }
        const [summary] = resolution.reelStripGeneration!.reels;
        expect(summary.reelIndex).toBe(0);
        expect(summary.config).toEqual({type: "generated", ...reel0Config});
        expect(summary.seed).toBe(7);
        expect(summary.success).toBe(true);
        expect(summary.strip).toHaveLength(10);
        const counts: Record<string, number> = {};
        for (const symbolId of summary.strip!) {
            counts[symbolId] = (counts[symbolId] ?? 0) + 1;
        }
        expect(counts).toEqual({A: 6, B: 3, W: 1});
    });

    it("applies constraints via the same ReelStripGenerator constraint classes", () => {
        const blueprint = baseBlueprint({
            reelStripGeneration: [
                {
                    type: "generated",
                    length: 12,
                    symbolCounts: {A: 6, B: 5, W: 1},
                    seed: 3,
                    constraints: [{type: "maximumConsecutiveOccurrences", maximumConsecutive: 2}],
                },
                {type: "literal", strip: ["A"]},
                {type: "literal", strip: ["B"]},
            ],
        });

        const resolution = resolveReelStripGeneration(blueprint);

        expect(resolution.success).toBe(true);
        if (!resolution.success) {
            return;
        }
        const strip = resolution.reelStripGeneration!.reels[0].strip!;
        let run = 1;
        for (let i = 1; i < strip.length; i++) {
            run = strip[i] === strip[i - 1] ? run + 1 : 1;
            expect(run).toBeLessThanOrEqual(2);
        }
    });

    it("fails with a per-reel diagnostic when one reel's constraints are unsatisfiable, without touching other reels", () => {
        const blueprint = baseBlueprint({
            reelStripGeneration: [
                {type: "literal", strip: ["A"]},
                {
                    type: "generated",
                    length: 4,
                    symbolCounts: {A: 2, W: 2},
                    seed: 5,
                    maxAttempts: 3,
                    constraints: [{type: "maximumCircularDistance", maximumDistance: 1, symbolIds: ["W"]}],
                },
                {type: "generated", length: 6, symbolCounts: {A: 4, B: 2}, seed: 1},
            ],
        });

        const resolution = resolveReelStripGeneration(blueprint);

        expect(resolution.success).toBe(false);
        if (resolution.success) {
            return;
        }
        // Only the 2 "generated" entries are attempted at all (index 0 is literal); reel 1 fails,
        // reel 2 succeeds on its own.
        expect(resolution.reels.map((reel) => reel.reelIndex)).toEqual([1, 2]);
        const failedReel = resolution.reels.find((reel) => reel.reelIndex === 1)!;
        expect(failedReel.success).toBe(false);
        expect(failedReel.attemptsUsed).toBe(3);
        expect(failedReel.diagnostics.some((diagnostic) => diagnostic.violations.some((v) => v.constraintId === "maximum-circular-distance"))).toBe(true);
        const succeededReel = resolution.reels.find((reel) => reel.reelIndex === 2)!;
        expect(succeededReel.success).toBe(true);
        expect(succeededReel.strip).toBeDefined();
    });

    it("fails with a single synthetic diagnostic when a constraint spec is invalid, without crashing", () => {
        const blueprint = baseBlueprint({
            reelStripGeneration: [
                {
                    type: "generated",
                    length: 10,
                    symbolCounts: {A: 6, B: 3, W: 1},
                    seed: 1,
                    constraints: [{type: "minimumCircularDistance", minimumDistance: -1}],
                },
                {type: "literal", strip: ["A"]},
                {type: "literal", strip: ["B"]},
            ],
        });

        const resolution = resolveReelStripGeneration(blueprint);

        expect(resolution.success).toBe(false);
        if (resolution.success) {
            return;
        }
        expect(resolution.reels).toHaveLength(1);
        expect(resolution.reels[0].reelIndex).toBe(0);
        expect(resolution.reels[0].diagnostics[0].violations[0]).toMatchObject({constraintId: "reelStripGeneration.constraints"});
        expect(resolution.reels[0].diagnostics[0].violations[0].message).toContain("minimumDistance must be a positive integer");
    });
});
