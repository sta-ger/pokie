import {
    ForbiddenAdjacencyConstraint,
    MaximumCircularDistanceConstraint,
    MaximumConsecutiveOccurrencesConstraint,
    MinimumCircularDistanceConstraint,
    ReelStrip,
    ReelStripAnalyzer,
    ReelStripConstraint,
    ReelStripDefinition,
    ReelStripGenerationStrategy,
    ReelStripGenerator,
    ReelStripScorer,
    RequiredAdjacencyConstraint,
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
        const alwaysFails: ReelStripConstraint = {
            getId: () => "always-fails",
            validate: () => [{constraintId: "always-fails", message: "never satisfied"}],
        };

        generator.generate({
            length: 3,
            symbolCounts: {A: 3},
            seed: 1,
            maxAttempts: 1,
            constraints: [alwaysFails],
            scorer: requestScorer,
        });

        expect(requestScorer.score).toHaveBeenCalled();
        expect(constructorScorer.score).not.toHaveBeenCalled();
    });

    test("a valid candidate is accepted immediately, even if a buggy scorer would have preferred an earlier invalid one", () => {
        let callCount = 0;
        const strategy: ReelStripGenerationStrategy = {
            generateCandidate: (): ReelStripDefinition => {
                callCount++;
                // Attempt 1 breaks the custom constraint below; attempt 2 satisfies it.
                return callCount === 1 ? new ReelStrip(["B", "A"]) : new ReelStrip(["A", "B"]);
            },
        };
        const aMustLeadConstraint: ReelStripConstraint = {
            getId: () => "a-must-lead",
            validate: (strip) => (strip.getSymbolAt(0) === "A" ? [] : [{constraintId: "a-must-lead", message: "A must be first"}]),
        };
        // A deliberately buggy scorer that scores invalid candidates *higher* than valid ones.
        const buggyScorer: ReelStripScorer = {
            score: (_strip, violations) => (violations.length === 0 ? -1000 : 1000),
        };
        const generator = new ReelStripGenerator(strategy, undefined, buggyScorer);

        const result = generator.generate({length: 2, symbolCounts: {A: 1, B: 1}, constraints: [aMustLeadConstraint]});

        expect(result.success).toBe(true);
        expect(result.strip!.toArray()).toEqual(["A", "B"]);
        expect(result.attemptsUsed).toBe(2);
    });

    test("re-validates a custom strategy's candidate against symbolCounts, even though it can't itself report failure", () => {
        const brokenStrategy: ReelStripGenerationStrategy = {
            generateCandidate: (): ReelStripDefinition => new ReelStrip(["A", "A", "A"]), // ignores symbolCounts entirely
        };
        const generator = new ReelStripGenerator(brokenStrategy);

        const result = generator.generate({length: 3, symbolCounts: {A: 2, B: 1}, maxAttempts: 3});

        expect(result.success).toBe(false);
        expect(
            result.diagnostics.every((diagnostic) => diagnostic.violations.some((violation) => violation.constraintId === "exact-symbol-counts")),
        ).toBe(true);
    });

    test("satisfies MaximumCircularDistanceConstraint and RequiredAdjacencyConstraint together", () => {
        const generator = new ReelStripGenerator();

        // Each "W" is locked immediately before an "M", structurally satisfying the (directed)
        // required adjacency regardless of how the remaining symbols get shuffled.
        const result = generator.generate({
            length: 10,
            symbolCounts: {W: 2, M: 2, S: 2, A: 2, B: 2},
            seed: 1,
            lockedPositions: {0: "W", 1: "M", 5: "W", 6: "M"},
            constraints: [new RequiredAdjacencyConstraint([["W", "M"]], true), new MaximumCircularDistanceConstraint(6, ["S"])],
        });

        expect(result.success).toBe(true);
        expect(result.strip!.getSymbolCounts()).toEqual({W: 2, M: 2, S: 2, A: 2, B: 2});
        expect(result.strip!.getSymbolAt(0)).toBe("W");
        expect(result.strip!.getSymbolAt(1)).toBe("M");

        const analysis = ReelStripAnalyzer.analyze(result.strip!);
        expect(analysis.minimumCircularDistances.S).toBeLessThanOrEqual(6);
    });

    test("fails when RequiredAdjacencyConstraint demands a neighbor symbol that never appears in symbolCounts", () => {
        const generator = new ReelStripGenerator();

        const result = generator.generate({
            length: 6,
            symbolCounts: {W: 1, A: 5}, // "M" is never in the pool, so "W" can never be next to it
            seed: 2,
            maxAttempts: 3,
            constraints: [new RequiredAdjacencyConstraint([["W", "M"]])],
        });

        expect(result.success).toBe(false);
        expect(result.attemptsUsed).toBe(3);
        expect(result.diagnostics.every((diagnostic) => diagnostic.violations.some((violation) => violation.constraintId === "required-adjacency"))).toBe(
            true,
        );
    });

    test("fails when MaximumCircularDistanceConstraint's bound is mathematically impossible for the given counts", () => {
        const generator = new ReelStripGenerator();

        // Two "S"s on a 4-long strip always split the circle into two gaps summing to 4, so both
        // gaps can never simultaneously be <= 1 -- no arrangement can ever satisfy this.
        const result = generator.generate({
            length: 4,
            symbolCounts: {S: 2, A: 2},
            seed: 3,
            maxAttempts: 3,
            constraints: [new MaximumCircularDistanceConstraint(1, ["S"])],
        });

        expect(result.success).toBe(false);
        expect(result.attemptsUsed).toBe(3);
        expect(
            result.diagnostics.every((diagnostic) => diagnostic.violations.some((violation) => violation.constraintId === "maximum-circular-distance")),
        ).toBe(true);
    });

    test("re-validates a custom strategy's candidate against lockedPositions, even though it can't itself report failure", () => {
        const brokenStrategy: ReelStripGenerationStrategy = {
            generateCandidate: (): ReelStripDefinition => new ReelStrip(["A", "B", "A"]), // ignores lockedPositions entirely
        };
        const generator = new ReelStripGenerator(brokenStrategy);

        const result = generator.generate({
            length: 3,
            symbolCounts: {A: 2, B: 1},
            lockedPositions: {0: "B"},
            maxAttempts: 3,
        });

        expect(result.success).toBe(false);
        expect(
            result.diagnostics.every((diagnostic) => diagnostic.violations.some((violation) => violation.constraintId === "fixed-positions")),
        ).toBe(true);
    });
});
