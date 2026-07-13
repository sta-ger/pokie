import {MaximumCircularDistanceConstraint, ReelStrip} from "pokie";

describe("MaximumCircularDistanceConstraint", () => {
    test("is silent when every occurrence of the target symbol is close enough together, including the wrap-around gap", () => {
        const constraint = new MaximumCircularDistanceConstraint(2, ["A"]);
        const strip = new ReelStrip(["A", "B", "A", "B"]);

        expect(constraint.validate(strip)).toEqual([]);
    });

    test("flags a pair of occurrences farther apart than the maximum distance", () => {
        const constraint = new MaximumCircularDistanceConstraint(2, ["A"]);
        const strip = new ReelStrip(["A", "B", "B", "A", "B", "B"]);

        // A occurs at 0 and 3: linear gap 3, wrap gap (6 - 3 + 0) = 3 -- both exceed the maximum of 2.
        const violations = constraint.validate(strip);
        expect(violations).toHaveLength(2);
        expect(violations[0]).toMatchObject({constraintId: "maximum-circular-distance", details: {symbolId: "A", gap: 3, maximumDistance: 2}});
    });

    test("defaults to checking every symbol on the strip when symbolIds is omitted", () => {
        const constraint = new MaximumCircularDistanceConstraint(1);
        const strip = new ReelStrip(["A", "B", "B", "B", "A"]);

        const violations = constraint.validate(strip);
        expect(violations.some((violation) => violation.details?.symbolId === "B")).toBe(true);
    });

    test("a symbol occurring 0 or 1 times has no gap to measure and is never flagged", () => {
        const constraint = new MaximumCircularDistanceConstraint(1, ["A", "Z"]);
        const strip = new ReelStrip(["A", "B", "B", "B", "B"]); // "A" occurs once, "Z" occurs 0 times

        expect(constraint.validate(strip)).toEqual([]);
    });

    test("wrapAround = false ignores the gap that crosses the strip's end", () => {
        // "A" occurs at positions 0 and 2, both clustered near the front: the direct arc between
        // them (0 -> 2) is only 2, within the maximum -- but the arc that wraps back around through
        // the strip's end (2 -> 0, i.e. 2 -> 3 -> 4 -> 5 -> 0) is 4, exceeding it.
        const strip = new ReelStrip(["A", "B", "A", "B", "B", "B"]);

        const wrapping = new MaximumCircularDistanceConstraint(2, ["A"], true);
        const linear = new MaximumCircularDistanceConstraint(2, ["A"], false);

        // Without wrap-around, only the single linear arc (0 -> 2, distance 2) is checked, which
        // satisfies the constraint.
        expect(linear.validate(strip)).toEqual([]);
        // With wrap-around, the wrap arc (2 -> 0, distance 4) is also checked and violates.
        expect(wrapping.validate(strip)).toHaveLength(1);
        expect(wrapping.validate(strip)[0]).toMatchObject({details: {symbolId: "A", gap: 4, maximumDistance: 2}});
    });

    describe("constructor validation", () => {
        test.each([NaN, Infinity, -Infinity, 0, -1, 1.5])("rejects a maximumDistance of %p", (invalidDistance) => {
            expect(() => new MaximumCircularDistanceConstraint(invalidDistance)).toThrow(/maximumDistance must be a positive integer/);
        });
    });
});
