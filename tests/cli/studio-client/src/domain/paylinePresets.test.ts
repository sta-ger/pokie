import {
    computePaylineSetPreviewCounts,
    describePaylineSetCompatibility,
    PAYLINE_PRESETS,
} from "../../../../../cli/studio-client/src/domain/paylinePresets";

describe("paylinePresets", () => {
    it("includes the required 5x3 preset family: center, 3 horizontals, classic 5/9/10/20", () => {
        const fiveByThree = PAYLINE_PRESETS.filter((preset) => preset.reels === 5 && preset.rows === 3);
        const lineCounts = fiveByThree.map((preset) => preset.lines.length).sort((a, b) => a - b);

        expect(lineCounts).toEqual([1, 3, 5, 9, 10, 20]);
    });

    it("nests every larger 5x3 preset's lines as a prefix of the next larger one, matching the engine's own line ids in order", () => {
        const fiveByThree = PAYLINE_PRESETS.filter((preset) => preset.reels === 5 && preset.rows === 3).sort((a, b) => a.lines.length - b.lines.length);

        for (let i = 0; i < fiveByThree.length - 1; i++) {
            const smaller = fiveByThree[i];
            const larger = fiveByThree[i + 1];
            expect(larger.lines.slice(0, smaller.lines.length)).toEqual(smaller.lines);
        }
    });

    it("gives every payline in every preset exactly `reels` cells, each a valid row index for `rows`", () => {
        PAYLINE_PRESETS.forEach((preset) => {
            preset.lines.forEach((line) => {
                expect(line).toHaveLength(preset.reels);
                line.forEach((row) => {
                    expect(row).toBeGreaterThanOrEqual(0);
                    expect(row).toBeLessThan(preset.rows);
                });
            });
        });
    });

    it("has no duplicate lines within a single preset", () => {
        PAYLINE_PRESETS.forEach((preset) => {
            const seen = new Set(preset.lines.map((line) => JSON.stringify(line)));
            expect(seen.size).toBe(preset.lines.length);
        });
    });

    describe("describePaylineSetCompatibility", () => {
        it("is compatible when the current layout exactly matches the set's shape", () => {
            expect(describePaylineSetCompatibility([[1, 1, 1, 1, 1]], 5, 3)).toEqual({compatible: true});
        });

        it("is incompatible with a reason when the reel count doesn't match", () => {
            const result = describePaylineSetCompatibility([[1, 1, 1, 1, 1]], 6, 3);

            expect(result.compatible).toBe(false);
            expect(result.reason).toMatch(/5 reels/);
        });

        it("is incompatible with a reason when a line needs a row the current layout doesn't have", () => {
            const result = describePaylineSetCompatibility([[0, 1, 2, 1, 0]], 5, 2);

            expect(result.compatible).toBe(false);
            expect(result.reason).toMatch(/3 rows/);
        });
    });

    describe("computePaylineSetPreviewCounts", () => {
        it("counts how many lines pass through each grid cell", () => {
            const counts = computePaylineSetPreviewCounts(
                [
                    [1, 1, 1],
                    [0, 1, 2],
                ],
                3,
                3,
            );

            expect(counts).toEqual([
                [1, 0, 0],
                [1, 2, 1],
                [0, 0, 1],
            ]);
        });

        it("returns an all-zero grid for an empty line set", () => {
            expect(computePaylineSetPreviewCounts([], 2, 2)).toEqual([
                [0, 0],
                [0, 0],
            ]);
        });
    });
});
