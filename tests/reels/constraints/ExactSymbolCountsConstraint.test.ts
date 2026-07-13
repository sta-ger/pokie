import {ExactSymbolCountsConstraint, ReelStrip} from "pokie";

describe("ExactSymbolCountsConstraint", () => {
    test("is silent when every symbol's count matches exactly", () => {
        const constraint = new ExactSymbolCountsConstraint({A: 2, B: 1});
        const strip = new ReelStrip(["A", "A", "B"]);

        expect(constraint.validate(strip)).toEqual([]);
    });

    test("flags a symbol whose actual count differs from its expected count", () => {
        const constraint = new ExactSymbolCountsConstraint({A: 1, B: 1});
        const strip = new ReelStrip(["A", "A", "B"]);

        const violations = constraint.validate(strip);
        expect(violations).toHaveLength(1);
        expect(violations[0]).toMatchObject({constraintId: "exact-symbol-counts", details: {symbolId: "A", expected: 1, actual: 2}});
    });

    test("flags a symbol present on the strip but absent from expectedCounts, as expecting 0", () => {
        const constraint = new ExactSymbolCountsConstraint({A: 1});
        const strip = new ReelStrip(["A", "X"]);

        const violations = constraint.validate(strip);
        expect(violations).toHaveLength(1);
        expect(violations[0].details).toEqual({symbolId: "X", expected: 0, actual: 1});
    });
});
