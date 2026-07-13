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
    it("passes a blueprint without reelStripGeneration through unchanged (same reference)", () => {
        const blueprint = baseBlueprint();

        const resolution = resolveReelStripGeneration(blueprint);

        expect(resolution).toEqual({success: true, blueprint});
        expect(resolution.success && resolution.blueprint).toBe(blueprint);
    });

    it("materializes exact reelStrips (one per reel) from symbolCounts, and drops reelStripGeneration", () => {
        const blueprint = baseBlueprint({
            reelStripGeneration: {length: 10, symbolCounts: {A: 5, B: 4, W: 1}, seed: 42},
        });

        const resolution = resolveReelStripGeneration(blueprint);

        expect(resolution.success).toBe(true);
        if (!resolution.success) {
            return;
        }
        expect(resolution.blueprint.reelStripGeneration).toBeUndefined();
        expect(resolution.blueprint.reelStrips).toHaveLength(3);
        for (const strip of resolution.blueprint.reelStrips!) {
            expect(strip).toHaveLength(10);
            const counts: Record<string, number> = {};
            for (const symbolId of strip) {
                counts[symbolId] = (counts[symbolId] ?? 0) + 1;
            }
            expect(counts).toEqual({A: 5, B: 4, W: 1});
        }
    });

    it("materializes reelStrips from symbolWeights via the Largest Remainder Method", () => {
        const blueprint = baseBlueprint({
            reelStripGeneration: {length: 10, symbolWeights: {A: 5, B: 4, W: 1}, seed: 7},
        });

        const resolution = resolveReelStripGeneration(blueprint);

        expect(resolution.success).toBe(true);
        if (!resolution.success) {
            return;
        }
        expect(resolution.blueprint.reelStrips).toHaveLength(3);
        expect(resolution.blueprint.reelStrips![0]).toHaveLength(10);
    });

    it("is deterministic: the same blueprint always resolves to byte-identical reelStrips", () => {
        const blueprint = baseBlueprint({
            reelStripGeneration: {length: 12, symbolWeights: {A: 5, B: 4, W: 1}, seed: 99},
        });

        const first = resolveReelStripGeneration(blueprint);
        const second = resolveReelStripGeneration(blueprint);

        expect(first.success && second.success).toBe(true);
        if (first.success && second.success) {
            expect(first.blueprint.reelStrips).toEqual(second.blueprint.reelStrips);
        }
    });

    it("gives every reel a different (but deterministic) seed, derived from the base seed", () => {
        const blueprint = baseBlueprint({
            reelStripGeneration: {length: 10, symbolCounts: {A: 5, B: 4, W: 1}, seed: 100},
        });

        const resolution = resolveReelStripGeneration(blueprint);

        expect(resolution.success).toBe(true);
        if (!resolution.success) {
            return;
        }
        expect(resolution.buildInfo!.reels.map((reel) => reel.seed)).toEqual([100, 101, 102]);
    });

    it("records build-info with the original config and a per-reel success summary", () => {
        const spec = {length: 10, symbolCounts: {A: 5, B: 4, W: 1}, seed: 5};
        const blueprint = baseBlueprint({reelStripGeneration: spec});

        const resolution = resolveReelStripGeneration(blueprint);

        expect(resolution.success).toBe(true);
        if (!resolution.success) {
            return;
        }
        expect(resolution.buildInfo!.config).toEqual(spec);
        expect(resolution.buildInfo!.reels).toHaveLength(3);
        expect(resolution.buildInfo!.reels.every((reel) => reel.success)).toBe(true);
    });

    it("applies constraints via the same ReelStripGenerator constraint classes", () => {
        const blueprint = baseBlueprint({
            reelStripGeneration: {
                length: 12,
                symbolCounts: {A: 6, B: 5, W: 1},
                seed: 3,
                constraints: [{type: "maximumConsecutiveOccurrences", maximumConsecutive: 2}],
            },
        });

        const resolution = resolveReelStripGeneration(blueprint);

        expect(resolution.success).toBe(true);
        if (!resolution.success) {
            return;
        }
        for (const strip of resolution.blueprint.reelStrips!) {
            let run = 1;
            for (let i = 1; i < strip.length; i++) {
                run = strip[i] === strip[i - 1] ? run + 1 : 1;
                expect(run).toBeLessThanOrEqual(2);
            }
        }
    });

    it("fails with a per-reel diagnostic when a reel's constraints are unsatisfiable", () => {
        const blueprint = baseBlueprint({
            reelStripGeneration: {
                length: 4,
                symbolCounts: {A: 2, W: 2},
                seed: 5,
                maxAttempts: 3,
                constraints: [{type: "maximumCircularDistance", maximumDistance: 1, symbolIds: ["W"]}],
            },
        });

        const resolution = resolveReelStripGeneration(blueprint);

        expect(resolution.success).toBe(false);
        if (resolution.success) {
            return;
        }
        expect(resolution.reels).toHaveLength(3); // one entry per reel, all failing the same way
        expect(resolution.reels.every((reel) => !reel.success && reel.attemptsUsed === 3)).toBe(true);
        expect(
            resolution.reels.every((reel) => reel.diagnostics.some((diagnostic) => diagnostic.violations.some((v) => v.constraintId === "maximum-circular-distance"))),
        ).toBe(true);
    });

    it("fails with a single synthetic diagnostic when a constraint spec is invalid, without crashing", () => {
        const blueprint = baseBlueprint({
            reelStripGeneration: {
                length: 10,
                symbolCounts: {A: 5, B: 4, W: 1},
                seed: 1,
                constraints: [{type: "minimumCircularDistance", minimumDistance: -1}],
            },
        });

        const resolution = resolveReelStripGeneration(blueprint);

        expect(resolution.success).toBe(false);
        if (resolution.success) {
            return;
        }
        expect(resolution.reels).toHaveLength(1);
        expect(resolution.reels[0].reelIndex).toBe(-1);
        expect(resolution.reels[0].diagnostics[0].violations[0]).toMatchObject({constraintId: "reelStripGeneration.constraints"});
        expect(resolution.reels[0].diagnostics[0].violations[0].message).toContain("minimumDistance must be a positive integer");
    });
});
