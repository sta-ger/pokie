import {FixedPositionsConstraint} from "../../../src/reels/constraints/FixedPositionsConstraint.js";
import {ReelStrip} from "../../../src/reels/ReelStrip.js";

describe("FixedPositionsConstraint", () => {
    test("is silent when every locked position holds its required symbol", () => {
        const constraint = new FixedPositionsConstraint({0: "A", 2: "C"});
        const strip = new ReelStrip(["A", "B", "C"]);

        expect(constraint.validate(strip)).toEqual([]);
    });

    test("flags a locked position that holds the wrong symbol", () => {
        const constraint = new FixedPositionsConstraint({0: "A", 2: "X"});
        const strip = new ReelStrip(["A", "B", "C"]);

        const violations = constraint.validate(strip);
        expect(violations).toHaveLength(1);
        expect(violations[0]).toMatchObject({
            constraintId: "fixed-positions",
            positions: [2],
            details: {position: 2, expectedSymbolId: "X", actualSymbolId: "C"},
        });
    });
});
