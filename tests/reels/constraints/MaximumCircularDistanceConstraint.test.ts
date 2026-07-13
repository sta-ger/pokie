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
        const strip = new ReelStrip(["A", "B", "B", "A"]);

        const wrapping = new MaximumCircularDistanceConstraint(2, ["A"], true);
        const linear = new MaximumCircularDistanceConstraint(2, ["A"], false);

        // Linear gap (0 -> 3) is 3, which exceeds the maximum of 2.
        expect(linear.validate(strip)).toHaveLength(1);
        // The wrap gap (3 -> 0) is only 1, which does not exceed the maximum -- so with wrapAround
        // considered too, the linear violation is still the only one (the wrap pair itself is fine).
        expect(wrapping.validate(strip)).toHaveLength(1);
    });
});
