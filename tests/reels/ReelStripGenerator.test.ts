import {
    ForbiddenAdjacencyConstraint,
    MaximumConsecutiveOccurrencesConstraint,
    MinimumCircularDistanceConstraint,
    ReelStripAnalyzer,
    ReelStripGenerator,
    ReelStripScorer,
} from "pokie";

describe("ReelStripGenerator", () => {
    test("the same seed always produces the same strip", () => {
        const generator = new ReelStripGenerator();
        const request = {length: 6, symbolCounts: {A: 2, B: 2, C: 2}, seed: 42};

        const first = generator.generate(request);
        const second = generator.generate(request);

        expect(first.success).toBe(true);
        expect(first.strip!.toArray()).toEqual(second.strip!.toArray());
    });

    test("a generated strip always holds exactly the requested symbol counts", () => {
        const generator = new ReelStripGenerator();

        const result = generator.generate({length: 10, symbolCounts: {A: 5, B: 3, C: 2}, seed: 1});

        expect(result.success).toBe(true);
        expect(result.strip!.getSymbolCounts()).toEqual({A: 5, B: 3, C: 2});
    });

    test("locked positions are honored in the generated strip", () => {
        const generator = new ReelStripGenerator();

        const result = generator.generate({
            length: 5,
            symbolCounts: {A: 3, B: 2},
            seed: 7,
            lockedPositions: {0: "B", 4: "B"},
        });

        expect(result.success).toBe(true);
        expect(result.strip!.getSymbolAt(0)).toBe("B");
        expect(result.strip!.getSymbolAt(4)).toBe("B");
    });

    test("satisfies a combination of distance, run-length, and adjacency constraints together", () => {
        const generator = new ReelStripGenerator();

        const result = generator.generate({
            length: 12,
            symbolCounts: {W: 2, A: 5, B: 5},
            seed: 123,
            constraints: [
                new MinimumCircularDistanceConstraint(4, ["W"]),
                new MaximumConsecutiveOccurrencesConstraint(2),
                new ForbiddenAdjacencyConstraint([["W", "W"]]),
            ],
        });

        expect(result.success).toBe(true);
        const analysis = ReelStripAnalyzer.analyze(result.strip!);
        expect(analysis.minimumCircularDistances.W).toBeGreaterThanOrEqual(4);
        expect(Math.max(...Object.values(analysis.maximumConsecutiveOccurrences))).toBeLessThanOrEqual(2);
    });

    test("reports clear per-attempt diagnostics and fails after exhausting maxAttempts when constraints are impossible to satisfy", () => {
        const generator = new ReelStripGenerator();

        // Two W's on a 4-long strip can never be more than 2 apart circularly, so a minimum distance
        // of 3 can never be satisfied by any arrangement.
        const result = generator.generate({
            length: 4,
            symbolCounts: {A: 2, W: 2},
            seed: 5,
            maxAttempts: 5,
            constraints: [new MinimumCircularDistanceConstraint(3, ["W"])],
        });

        expect(result.success).toBe(false);
        expect(result.attemptsUsed).toBe(5);
        expect(result.diagnostics).toHaveLength(5);
        expect(result.diagnostics.every((diagnostic) => !diagnostic.accepted)).toBe(true);
        expect(result.diagnostics[0].violations[0].constraintId).toBe("minimum-circular-distance");
        // The best (lowest-violation) candidate is still returned for inspection, even on failure.
        expect(result.strip).toBeDefined();
    });

    test("reports a clear diagnostic, with no attempts spent, when the request itself is malformed", () => {
        const generator = new ReelStripGenerator();

        const result = generator.generate({length: 5, symbolCounts: {A: 2, B: 2}, seed: 1});

        expect(result.success).toBe(false);
        expect(result.attemptsUsed).toBe(0);
        expect(result.strip).toBeUndefined();
        expect(result.diagnostics[0].violations[0].constraintId).toBe("request.symbolCounts");
    });

    test("request.scorer overrides the constructor-level scorer for that single call", () => {
        const constructorScorer: ReelStripScorer = {score: jest.fn(() => -100)};
        const requestScorer: ReelStripScorer = {score: jest.fn(() => 0)};
        const generator = new ReelStripGenerator(undefined, undefined, constructorScorer);

        generator.generate({length: 3, symbolCounts: {A: 3}, seed: 1, maxAttempts: 1, scorer: requestScorer});

        expect(requestScorer.score).toHaveBeenCalled();
        expect(constructorScorer.score).not.toHaveBeenCalled();
    });
});
