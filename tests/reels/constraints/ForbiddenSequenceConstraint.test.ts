import {ForbiddenSequenceConstraint, ReelStrip} from "pokie";

describe("ForbiddenSequenceConstraint", () => {
    test("is silent when the forbidden sequence never occurs", () => {
        const constraint = new ForbiddenSequenceConstraint(["A", "B"]);
        const strip = new ReelStrip(["X", "Y", "Z"]);

        expect(constraint.validate(strip)).toEqual([]);
    });

    test("flags a single occurrence under the default maximumOccurrences of 0", () => {
        const constraint = new ForbiddenSequenceConstraint(["A", "B"]);
        const strip = new ReelStrip(["X", "A", "B", "Y"]);

        const violations = constraint.validate(strip);
        expect(violations).toHaveLength(1);
        expect(violations[0]).toMatchObject({
            constraintId: "forbidden-sequence",
            positions: [1, 2],
            details: {sequence: ["A", "B"], matched: ["A", "B"], occurrencesFound: 1, maximumOccurrences: 0},
        });
    });

    test("a raised maximumOccurrences allows a restricted number of occurrences instead of banning the pattern outright", () => {
        const constraint = new ForbiddenSequenceConstraint(["A", "B"], 2, false, false);
        const strip = new ReelStrip(["A", "B", "X", "A", "B"]);

        expect(constraint.validate(strip)).toEqual([]);
    });

    test("reports one violation per occurrence once maximumOccurrences is exceeded", () => {
        const constraint = new ForbiddenSequenceConstraint(["A", "B"], 1, false, false);
        const strip = new ReelStrip(["A", "B", "X", "A", "B"]);

        const violations = constraint.validate(strip);
        expect(violations).toHaveLength(2);
        expect(violations.map((violation) => violation.positions)).toEqual([
            [0, 1],
            [3, 4],
        ]);
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
