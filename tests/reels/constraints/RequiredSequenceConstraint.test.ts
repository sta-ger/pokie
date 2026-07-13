import {ReelStrip, RequiredSequenceConstraint, ViolationCountReelStripScorer} from "pokie";

describe("RequiredSequenceConstraint", () => {
    test("is silent when the sequence occurs at least the default minimum of 1 time", () => {
        const constraint = new RequiredSequenceConstraint(["A", "B", "C"]);
        const strip = new ReelStrip(["X", "A", "B", "C", "Y"]);

        expect(constraint.validate(strip)).toEqual([]);
    });

    test("flags a sequence that never occurs at all", () => {
        const constraint = new RequiredSequenceConstraint(["A", "B", "C"]);
        const strip = new ReelStrip(["X", "Y", "Z"]);

        const violations = constraint.validate(strip);
        expect(violations).toHaveLength(1);
        expect(violations[0]).toMatchObject({
            constraintId: "required-sequence",
            positions: [],
            details: {sequence: ["A", "B", "C"], occurrencesFound: 0, minimumOccurrences: 1},
        });
    });

    test("flags a sequence occurring fewer times than a raised minimumOccurrences", () => {
        const constraint = new RequiredSequenceConstraint(["A", "B", "C"], 2);
        const strip = new ReelStrip(["A", "B", "C", "X", "Y"]);

        const violations = constraint.validate(strip);
        expect(violations).toHaveLength(1);
        expect(violations[0]).toMatchObject({
            positions: [0, 1, 2],
            details: {occurrencesFound: 1, minimumOccurrences: 2},
        });
    });

    test("reports one violation for the single occurrence when maximumOccurrences = 0, including positions and the matched run", () => {
        const constraint = new RequiredSequenceConstraint(["A", "B", "C"], 0, 0);
        const strip = new ReelStrip(["X", "A", "B", "C"]);

        const violations = constraint.validate(strip);
        expect(violations).toHaveLength(1);
        expect(violations[0]).toMatchObject({
            positions: [1, 2, 3],
            details: {sequence: ["A", "B", "C"], matched: ["A", "B", "C"], occurrencesFound: 1, maximumOccurrences: 0, excessOccurrences: 1},
        });
    });

    test("2 occurrences with maximumOccurrences = 1 yields exactly 1 violation, for the excess occurrence only", () => {
        const constraint = new RequiredSequenceConstraint(["A", "B"], 0, 1, false, true);
        const strip = new ReelStrip(["A", "B", "A", "B"]);

        // Occurrences at position 0 (A,B) and position 2 (A,B); position 1 (B,A) and the wrap-around
        // start at position 3 (B,A) don't match. Only the *second* (excess) occurrence is a violation
        // -- the first is within the allowed maximum.
        const violations = constraint.validate(strip);
        expect(violations).toHaveLength(1);
        expect(violations[0]).toMatchObject({
            positions: [2, 3],
            details: {occurrencesFound: 2, maximumOccurrences: 1, excessOccurrences: 1},
        });
    });

    test("3 occurrences with maximumOccurrences = 2 yields exactly 1 violation, for the excess occurrence only", () => {
        const constraint = new RequiredSequenceConstraint(["A"], 0, 2, false, false);
        const strip = new ReelStrip(["A", "X", "A", "X", "A"]);

        const violations = constraint.validate(strip);
        expect(violations).toHaveLength(1);
        expect(violations[0]).toMatchObject({
            positions: [4],
            details: {occurrencesFound: 3, maximumOccurrences: 2, excessOccurrences: 1},
        });
    });

    test("the corrected (excess-only) violation count is reflected by ViolationCountReelStripScorer", () => {
        const constraint = new RequiredSequenceConstraint(["A"], 0, 1, false, false);
        const scorer = new ViolationCountReelStripScorer();

        const oneExcess = new ReelStrip(["A", "X", "A"]); // 2 occurrences, 1 excess
        const twoExcess = new ReelStrip(["A", "A", "A"]); // 3 occurrences, 2 excess

        const violationsForOneExcess = constraint.validate(oneExcess);
        const violationsForTwoExcess = constraint.validate(twoExcess);

        expect(violationsForOneExcess).toHaveLength(1);
        expect(violationsForTwoExcess).toHaveLength(2);
        expect(scorer.score(oneExcess, violationsForOneExcess)).toBe(-1);
        expect(scorer.score(twoExcess, violationsForTwoExcess)).toBe(-2);
        expect(scorer.score(oneExcess, violationsForOneExcess)).toBeGreaterThan(scorer.score(twoExcess, violationsForTwoExcess));
    });

    test("a palindrome sequence with reversed = true is not counted twice for a single match", () => {
        const constraint = new RequiredSequenceConstraint(["A", "B", "A"], 1, 1, true, false);
        const strip = new ReelStrip(["A", "B", "A"]);

        // If the palindrome were (incorrectly) counted as both a forward and a reversed match at the
        // same position, this would report occurrencesFound: 2 and violate maximumOccurrences = 1.
        expect(constraint.validate(strip)).toEqual([]);
    });

    test("reversed = true also accepts the sequence read backwards", () => {
        const forward = new RequiredSequenceConstraint(["A", "B", "C"], 1, Infinity, false, false);
        const reversed = new RequiredSequenceConstraint(["A", "B", "C"], 1, Infinity, true, false);
        const strip = new ReelStrip(["C", "B", "A"]);

        expect(forward.validate(strip)).toHaveLength(1); // occurrencesFound: 0, below minimum
        expect(reversed.validate(strip)).toEqual([]);
    });

    test("wrapAround = true allows a match to read across the strip's end", () => {
        const wrapping = new RequiredSequenceConstraint(["A", "B", "C"], 1, Infinity, false, true);
        const linear = new RequiredSequenceConstraint(["A", "B", "C"], 1, Infinity, false, false);
        const strip = new ReelStrip(["B", "C", "A"]);

        expect(wrapping.validate(strip)).toEqual([]);
        expect(linear.validate(strip)).toHaveLength(1);
    });

    describe("constructor validation", () => {
        test("rejects an empty sequence", () => {
            expect(() => new RequiredSequenceConstraint([])).toThrow(/sequence must contain at least one symbol/);
        });

        test.each([-1, 1.5, NaN, Infinity])("rejects a minimumOccurrences of %p", (invalidMinimum) => {
            expect(() => new RequiredSequenceConstraint(["A"], invalidMinimum)).toThrow(/minimumOccurrences must be a non-negative integer/);
        });

        test.each([-1, 1.5, NaN])("rejects a maximumOccurrences of %p", (invalidMaximum) => {
            expect(() => new RequiredSequenceConstraint(["A"], 0, invalidMaximum)).toThrow(
                /maximumOccurrences must be a non-negative integer or Infinity/,
            );
        });

        test("rejects maximumOccurrences below minimumOccurrences", () => {
            expect(() => new RequiredSequenceConstraint(["A"], 2, 1)).toThrow(/maximumOccurrences \(1\) must be >= minimumOccurrences \(2\)/);
        });
    });
});
