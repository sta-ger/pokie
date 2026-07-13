import {LargestRemainderReelStripSymbolWeightsConverter} from "pokie";

describe("LargestRemainderReelStripSymbolWeightsConverter", () => {
    const converter = new LargestRemainderReelStripSymbolWeightsConverter();

    test("produces exact counts with zero deviation when weights divide length evenly", () => {
        const result = converter.convert({length: 10, symbolWeights: {A: 50, B: 30, C: 20}});

        expect(result.success).toBe(true);
        expect(result.symbolCounts).toEqual({A: 5, B: 3, C: 2});
        expect(result.diagnostic).toEqual({
            weights: {A: 50, B: 30, C: 20},
            counts: {A: 5, B: 3, C: 2},
            targetProportions: {A: 0.5, B: 0.3, C: 0.2},
            actualProportions: {A: 0.5, B: 0.3, C: 0.2},
            deviations: {A: 0, B: 0, C: 0},
        });
    });

    test("distributes the remainder to the largest fractional part, breaking ties by symbol ID by default", () => {
        // Each of A/B/C has an exact quota of 10/3 = 3.333..., floor gives 3 each (sum 9, remainder 1).
        // All three tie on fractional remainder (0.333...), so "symbol-id" order picks "A".
        const result = converter.convert({length: 10, symbolWeights: {A: 1, B: 1, C: 1}});

        expect(result.success).toBe(true);
        expect(result.symbolCounts).toEqual({A: 4, B: 3, C: 3});

        const diagnostic = result.diagnostic!;
        expect(diagnostic.targetProportions.A).toBeCloseTo(1 / 3);
        expect(diagnostic.actualProportions).toEqual({A: 0.4, B: 0.3, C: 0.3});
        expect(diagnostic.deviations.A).toBeCloseTo(0.4 - 1 / 3);
        expect(diagnostic.deviations.B).toBeCloseTo(0.3 - 1 / 3);
    });

    test("remainderTieBreakPolicy = declared-order breaks ties by first appearance in symbolWeights", () => {
        const result = converter.convert({
            length: 10,
            symbolWeights: {C: 1, B: 1, A: 1},
            remainderTieBreakPolicy: "declared-order",
        });

        expect(result.symbolCounts).toEqual({C: 4, B: 3, A: 3});
    });

    test("remainderTieBreakPolicy = largest-weight-first breaks ties in favor of the heavier weight", () => {
        // quota(A) = 1/4 * 2 = 0.5, quota(B) = 3/4 * 2 = 1.5 -- both floor to a fractional remainder
        // of 0.5, tied despite unequal weights.
        const bySymbolId = converter.convert({length: 2, symbolWeights: {A: 1, B: 3}});
        expect(bySymbolId.symbolCounts).toEqual({A: 1, B: 1});

        const byWeight = converter.convert({
            length: 2,
            symbolWeights: {A: 1, B: 3},
            remainderTieBreakPolicy: "largest-weight-first",
        });
        expect(byWeight.symbolCounts).toEqual({A: 0, B: 2});
    });

    test("roundingPolicy = floor never overshoots length on its own (remainder is always >= 0)", () => {
        const result = converter.convert({length: 10, symbolWeights: {A: 1, B: 1, C: 1}, roundingPolicy: "floor"});

        expect(Object.values(result.symbolCounts!).reduce((sum, count) => sum + count, 0)).toBe(10);
    });

    test("roundingPolicy = ceil overshoots and corrects downward, removing from the least-favored symbols first", () => {
        // Each quota is 4/3 = 1.333..., ceil gives 2 each (sum 6, remainder -2). All three tie on
        // fractional remainder, so "symbol-id" order removes from "A" then "B" first.
        const result = converter.convert({length: 4, symbolWeights: {A: 1, B: 1, C: 1}, roundingPolicy: "ceil"});

        expect(result.symbolCounts).toEqual({A: 1, B: 1, C: 2});
        expect(Object.values(result.symbolCounts!).reduce((sum, count) => sum + count, 0)).toBe(4);
    });

    test("roundingPolicy = round rounds each quota to the nearest integer before remainder correction", () => {
        const result = converter.convert({length: 4, symbolWeights: {A: 1, B: 2}, roundingPolicy: "round"});

        expect(Object.values(result.symbolCounts!).reduce((sum, count) => sum + count, 0)).toBe(4);
    });

    describe("validation", () => {
        test("rejects a non-positive or non-integer length", () => {
            const result = converter.convert({length: 0, symbolWeights: {A: 1}});

            expect(result.success).toBe(false);
            expect(result.symbolCounts).toBeUndefined();
            expect(result.violations).toEqual([expect.objectContaining({constraintId: "symbolWeights.length"})]);
        });

        test("rejects an empty symbolWeights map", () => {
            const result = converter.convert({length: 5, symbolWeights: {}});

            expect(result.success).toBe(false);
            expect(result.violations).toEqual([expect.objectContaining({constraintId: "symbolWeights.weights"})]);
        });

        test("rejects a zero weight", () => {
            const result = converter.convert({length: 5, symbolWeights: {A: 0, B: 1}});

            expect(result.success).toBe(false);
            expect(result.violations).toEqual([
                expect.objectContaining({constraintId: "symbolWeights.weights", details: {symbolId: "A", weight: 0}}),
            ]);
        });

        test("rejects a negative weight", () => {
            const result = converter.convert({length: 5, symbolWeights: {A: -1, B: 1}});

            expect(result.success).toBe(false);
            expect(result.violations).toEqual([
                expect.objectContaining({constraintId: "symbolWeights.weights", details: {symbolId: "A", weight: -1}}),
            ]);
        });

        test("rejects a NaN weight", () => {
            const result = converter.convert({length: 5, symbolWeights: {A: NaN, B: 1}});

            expect(result.success).toBe(false);
            expect(result.violations[0]).toMatchObject({constraintId: "symbolWeights.weights", details: {symbolId: "A"}});
        });

        test("rejects an Infinity weight", () => {
            const result = converter.convert({length: 5, symbolWeights: {A: Infinity, B: 1}});

            expect(result.success).toBe(false);
            expect(result.violations[0]).toMatchObject({
                constraintId: "symbolWeights.weights",
                details: {symbolId: "A", weight: Infinity},
            });
        });

        test("reports one violation per invalid weight, plus any request-level violations, in a single pass", () => {
            const result = converter.convert({length: -1, symbolWeights: {A: 0, B: -1, C: 1}});

            expect(result.violations).toHaveLength(3); // length, A, B (C is valid)
        });
    });
});
