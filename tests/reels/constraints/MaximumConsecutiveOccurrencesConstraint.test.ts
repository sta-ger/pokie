import {MaximumConsecutiveOccurrencesConstraint, ReelStrip} from "pokie";

describe("MaximumConsecutiveOccurrencesConstraint", () => {
    test("is silent when no run of identical adjacent symbols exceeds the maximum", () => {
        const constraint = new MaximumConsecutiveOccurrencesConstraint(2);
        const strip = new ReelStrip(["A", "A", "B", "B", "C"]);

        expect(constraint.validate(strip)).toEqual([]);
    });

    test("flags a run longer than the maximum, reporting every position in the run", () => {
        const constraint = new MaximumConsecutiveOccurrencesConstraint(2);
        const strip = new ReelStrip(["A", "A", "A", "B"]);

        const violations = constraint.validate(strip);
        expect(violations).toHaveLength(1);
        expect(violations[0]).toMatchObject({
            constraintId: "maximum-consecutive-occurrences",
            positions: [0, 1, 2],
            details: {symbolId: "A", runLength: 3, maximumConsecutive: 2},
        });
    });

    test("wrapAround = true joins a run that straddles the strip's end", () => {
        const constraint = new MaximumConsecutiveOccurrencesConstraint(1);
        const strip = new ReelStrip(["A", "B", "B", "A"]);

        const violations = constraint.validate(strip);
        const symbolIds = violations.map((violation) => violation.details?.symbolId).sort();
        expect(symbolIds).toEqual(["A", "B"]);
        const aViolation = violations.find((violation) => violation.details?.symbolId === "A");
        expect(aViolation?.positions?.sort()).toEqual([0, 3]);
    });

    test("wrapAround = false treats the strip's first and last symbols as unrelated", () => {
        const constraint = new MaximumConsecutiveOccurrencesConstraint(1, undefined, false);
        const strip = new ReelStrip(["A", "B", "B", "A"]);

        const violations = constraint.validate(strip);
        // Only the linear "B B" run violates; the two single "A"s at each end are no longer joined.
        expect(violations).toHaveLength(1);
        expect(violations[0].details?.symbolId).toBe("B");
    });

    test("a strip made of a single repeated symbol is one run spanning the whole length", () => {
        const constraint = new MaximumConsecutiveOccurrencesConstraint(3);
        const strip = new ReelStrip(["A", "A", "A", "A"]);

        const violations = constraint.validate(strip);
        expect(violations).toHaveLength(1);
        expect(violations[0].details?.runLength).toBe(4);
    });

    test("symbolIds restricts which symbols are checked", () => {
        const constraint = new MaximumConsecutiveOccurrencesConstraint(1, ["B"]);
        const strip = new ReelStrip(["A", "A", "B", "B"]);

        // The A A run would violate too, but only B is being checked.
        const violations = constraint.validate(strip);
        expect(violations).toHaveLength(1);
        expect(violations[0].details?.symbolId).toBe("B");
    });
});
