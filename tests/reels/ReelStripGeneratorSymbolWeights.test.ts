import {MaximumConsecutiveOccurrencesConstraint, ReelStripGenerator} from "pokie";

describe("ReelStripGenerator.generateFromSymbolWeights", () => {
    test("converts symbolWeights into exact symbolCounts and generates through the same generate() path", () => {
        const generator = new ReelStripGenerator();

        const result = generator.generateFromSymbolWeights({length: 8, symbolWeights: {A: 3, B: 1}, seed: 1});

        expect(result.success).toBe(true);
        expect(result.strip!.getSymbolCounts()).toEqual({A: 6, B: 2});
    });

    test("attaches the weight-conversion diagnostic (weights, counts, and proportion deviation) to the result", () => {
        const generator = new ReelStripGenerator();

        const result = generator.generateFromSymbolWeights({length: 10, symbolWeights: {A: 1, B: 1, C: 1}, seed: 1});

        expect(result.symbolWeightsConversion).toBeDefined();
        expect(result.symbolWeightsConversion!.weights).toEqual({A: 1, B: 1, C: 1});
        expect(result.symbolWeightsConversion!.counts).toEqual({A: 4, B: 3, C: 3});
        expect(result.symbolWeightsConversion!.deviations.A).toBeCloseTo(0.4 - 1 / 3);
    });

    test("the same seed always produces the same strip from the same weighted request", () => {
        const generator = new ReelStripGenerator();
        const request = {length: 12, symbolWeights: {W: 1, A: 5, B: 5}, seed: 42};

        const first = generator.generateFromSymbolWeights(request);
        const second = generator.generateFromSymbolWeights(request);

        expect(first.success).toBe(true);
        expect(first.strip!.toArray()).toEqual(second.strip!.toArray());
    });

    test("request.constraints are still enforced for weight-based generation", () => {
        const generator = new ReelStripGenerator();

        const result = generator.generateFromSymbolWeights({
            length: 12,
            symbolWeights: {A: 5, B: 5, C: 2},
            seed: 7,
            constraints: [new MaximumConsecutiveOccurrencesConstraint(2)],
        });

        expect(result.success).toBe(true);
        expect(result.strip!.getSymbolCounts()).toEqual({A: 5, B: 5, C: 2});
    });

    test("lockedPositions are still honored for weight-based generation", () => {
        const generator = new ReelStripGenerator();

        const result = generator.generateFromSymbolWeights({
            length: 6,
            symbolWeights: {A: 2, B: 1},
            seed: 3,
            lockedPositions: {0: "B"},
        });

        expect(result.success).toBe(true);
        expect(result.strip!.getSymbolAt(0)).toBe("B");
    });

    test("roundingPolicy and remainderTieBreakPolicy are threaded through to the converter", () => {
        const generator = new ReelStripGenerator();

        const bySymbolId = generator.generateFromSymbolWeights({length: 2, symbolWeights: {A: 1, B: 3}, seed: 1});
        expect(bySymbolId.strip!.getSymbolCounts()).toEqual({A: 1, B: 1});

        const byWeight = generator.generateFromSymbolWeights({
            length: 2,
            symbolWeights: {A: 1, B: 3},
            seed: 1,
            remainderTieBreakPolicy: "largest-weight-first",
        });
        // A's resolved count is 0, so it never appears on the strip at all: ReelStrip.getSymbolCounts()
        // only reports symbols that actually occur, unlike the converter's own symbolCounts output.
        expect(byWeight.strip!.getSymbolCounts()).toEqual({B: 2});
        expect(byWeight.symbolWeightsConversion!.counts).toEqual({A: 0, B: 2});
    });

    test("an invalid symbolWeights map fails immediately with a clear diagnostic and no attempts spent", () => {
        const generator = new ReelStripGenerator();

        const result = generator.generateFromSymbolWeights({length: 8, symbolWeights: {A: 0, B: 1}});

        expect(result.success).toBe(false);
        expect(result.attemptsUsed).toBe(0);
        expect(result.strip).toBeUndefined();
        expect(result.symbolWeightsConversion).toBeUndefined();
        expect(result.diagnostics[0].violations[0]).toMatchObject({constraintId: "symbolWeights.weights"});
    });
});
