import {ForbiddenSequenceConstraint, ReelStrip, ViolationCountReelStripScorer} from "pokie";

describe("ForbiddenSequenceConstraint", () => {
    test("is silent when the forbidden sequence never occurs", () => {
        const constraint = new ForbiddenSequenceConstraint(["A", "B"]);
        const strip = new ReelStrip(["X", "Y", "Z"]);

        expect(constraint.validate(strip)).toEqual([]);
    });

    test("flags the single occurrence under the default maximumOccurrences of 0", () => {
        const constraint = new ForbiddenSequenceConstraint(["A", "B"]);
        const strip = new ReelStrip(["X", "A", "B", "Y"]);

        const violations = constraint.validate(strip);
        expect(violations).toHaveLength(1);
        expect(violations[0]).toMatchObject({
            constraintId: "forbidden-sequence",
            positions: [1, 2],
            details: {sequence: ["A", "B"], matched: ["A", "B"], occurrencesFound: 1, maximumOccurrences: 0, excessOccurrences: 1},
        });
    });

    test("a raised maximumOccurrences allows a restricted number of occurrences instead of banning the pattern outright", () => {
        const constraint = new ForbiddenSequenceConstraint(["A", "B"], 2, false, false);
        const strip = new ReelStrip(["A", "B", "X", "A", "B"]);

        expect(constraint.validate(strip)).toEqual([]);
    });

    test("2 occurrences with maximumOccurrences = 1 yields exactly 1 violation, for the excess occurrence only", () => {
        const constraint = new ForbiddenSequenceConstraint(["A", "B"], 1, false, false);
        const strip = new ReelStrip(["A", "B", "X", "A", "B"]);

        const violations = constraint.validate(strip);
        expect(violations).toHaveLength(1);
        expect(violations[0]).toMatchObject({
            positions: [3, 4],
            details: {occurrencesFound: 2, maximumOccurrences: 1, excessOccurrences: 1},
        });
    });

    test("3 occurrences with maximumOccurrences = 2 yields exactly 1 violation, for the excess occurrence only", () => {
        const constraint = new ForbiddenSequenceConstraint(["A"], 2, false, false);
        const strip = new ReelStrip(["A", "X", "A", "X", "A"]);

        const violations = constraint.validate(strip);
        expect(violations).toHaveLength(1);
        expect(violations[0]).toMatchObject({
            positions: [4],
            details: {occurrencesFound: 3, maximumOccurrences: 2, excessOccurrences: 1},
        });
    });

    test("the corrected (excess-only) violation count is reflected by ViolationCountReelStripScorer", () => {
        const constraint = new ForbiddenSequenceConstraint(["A"], 1, false, false);
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
        const constraint = new ForbiddenSequenceConstraint(["A", "B", "A"], 1, true, false);
        const strip = new ReelStrip(["A", "B", "A"]);

        // If the palindrome were (incorrectly) counted as both a forward and a reversed match at the
        // same position, this would report occurrencesFound: 2 and violate maximumOccurrences = 1.
        expect(constraint.validate(strip)).toEqual([]);
    });

    test("reversed = true also forbids the sequence read backwards", () => {
        const forward = new ForbiddenSequenceConstraint(["A", "B"], 0, false, false);
        const reversed = new ForbiddenSequenceConstraint(["A", "B"], 0, true, false);
        const strip = new ReelStrip(["B", "A"]);

        expect(forward.validate(strip)).toEqual([]);
        expect(reversed.validate(strip)).toHaveLength(1);
    });

    test("wrapAround = true also forbids a match that reads across the strip's end", () => {
        const wrapping = new ForbiddenSequenceConstraint(["A", "B"], 0, false, true);
        const linear = new ForbiddenSequenceConstraint(["A", "B"], 0, false, false);
        const strip = new ReelStrip(["B", "A"]);

        // Only the wrap-around window (position 1 -> 0) reads "A", "B"; the single linear window
        // (position 0 -> 1) reads "B", "A".
        expect(wrapping.validate(strip)).toHaveLength(1);
        expect(linear.validate(strip)).toEqual([]);
    });

    describe("constructor validation", () => {
        test("rejects an empty sequence", () => {
            expect(() => new ForbiddenSequenceConstraint([])).toThrow(/sequence must contain at least one symbol/);
        });

        test.each([-1, 1.5, NaN])("rejects a maximumOccurrences of %p", (invalidMaximum) => {
            expect(() => new ForbiddenSequenceConstraint(["A"], invalidMaximum)).toThrow(/maximumOccurrences must be a non-negative integer/);
        });
    });
});
