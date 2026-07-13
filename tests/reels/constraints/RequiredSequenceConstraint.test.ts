import {ReelStrip, RequiredSequenceConstraint} from "pokie";

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

    test("reports one violation per occurrence when maximumOccurrences is exceeded, including positions and the matched run", () => {
        const constraint = new RequiredSequenceConstraint(["A", "B", "C"], 0, 0);
        const strip = new ReelStrip(["X", "A", "B", "C"]);

        const violations = constraint.validate(strip);
        expect(violations).toHaveLength(1);
        expect(violations[0]).toMatchObject({
            positions: [1, 2, 3],
            details: {sequence: ["A", "B", "C"], matched: ["A", "B", "C"], occurrencesFound: 1, maximumOccurrences: 0},
        });
    });

    test("reports every occurrence separately when there are more matches than maximumOccurrences allows", () => {
        const constraint = new RequiredSequenceConstraint(["A", "B"], 1, 1, false, true);
        const strip = new ReelStrip(["A", "B", "A", "B"]);

        // Occurrences at position 0 (A,B) and position 2 (A,B); position 1 (B,A) and the wrap-around
        // start at position 3 (B,A) don't match.
        const violations = constraint.validate(strip);
        expect(violations).toHaveLength(2);
        expect(violations.map((violation) => violation.positions)).toEqual([
            [0, 1],
            [2, 3],
        ]);
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
