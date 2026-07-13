import {MinimumCircularDistanceConstraint, ReelStrip} from "pokie";

describe("MinimumCircularDistanceConstraint", () => {
    test("is silent when every occurrence of the target symbol is far enough apart, including the wrap-around gap", () => {
        const constraint = new MinimumCircularDistanceConstraint(2, ["A"]);
        const strip = new ReelStrip(["A", "B", "A", "B"]);

        expect(constraint.validate(strip)).toEqual([]);
    });

    test("flags a pair of occurrences closer together than the minimum distance", () => {
        const constraint = new MinimumCircularDistanceConstraint(2, ["A"]);
        const strip = new ReelStrip(["A", "A", "B", "B"]);

        const violations = constraint.validate(strip);
        expect(violations).toHaveLength(1);
        expect(violations[0]).toMatchObject({constraintId: "minimum-circular-distance", positions: [0, 1], details: {symbolId: "A", gap: 1}});
    });

    test("defaults to checking every symbol on the strip when symbolIds is omitted", () => {
        const constraint = new MinimumCircularDistanceConstraint(3);
        const strip = new ReelStrip(["A", "A", "B", "C"]);

        const violations = constraint.validate(strip);
        expect(violations.some((violation) => violation.details?.symbolId === "A")).toBe(true);
    });

    test("wrapAround = false ignores the gap that crosses the strip's end", () => {
        const strip = new ReelStrip(["A", "B", "B", "A"]);

        const wrapping = new MinimumCircularDistanceConstraint(2, ["A"], true);
        const linear = new MinimumCircularDistanceConstraint(2, ["A"], false);

        // Wrap gap between position 3 and position 0 is only 1 apart -> violates with wrapAround.
        expect(wrapping.validate(strip)).toHaveLength(1);
        // Without wrap-around, only the single linear gap (0 -> 3, distance 3) is checked, which satisfies the constraint.
        expect(linear.validate(strip)).toEqual([]);
    });

    describe("constructor validation", () => {
        test.each([NaN, Infinity, -Infinity, 0, -1, 1.5])("rejects a minimumDistance of %p", (invalidDistance) => {
            expect(() => new MinimumCircularDistanceConstraint(invalidDistance)).toThrow(/minimumDistance must be a positive integer/);
        });
    });
});
