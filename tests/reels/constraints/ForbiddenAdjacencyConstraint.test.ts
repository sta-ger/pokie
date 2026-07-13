import {ForbiddenAdjacencyConstraint, ReelStrip} from "pokie";

describe("ForbiddenAdjacencyConstraint", () => {
    test("is silent when no forbidden pair sits next to each other", () => {
        const constraint = new ForbiddenAdjacencyConstraint([["W", "W"]]);
        const strip = new ReelStrip(["W", "A", "W", "B"]);

        expect(constraint.validate(strip)).toEqual([]);
    });

    test("flags an adjacent pair regardless of which symbol was listed first", () => {
        const constraint = new ForbiddenAdjacencyConstraint([["A", "B"]]);
        const strip = new ReelStrip(["X", "B", "A", "Y"]);

        const violations = constraint.validate(strip);
        expect(violations).toHaveLength(1);
        expect(violations[0]).toMatchObject({constraintId: "forbidden-adjacency", positions: [1, 2]});
    });

    test("wrapAround = true also checks the pair formed by the last and first symbol", () => {
        const strip = new ReelStrip(["W", "A", "W"]);

        const wrapping = new ForbiddenAdjacencyConstraint([["W", "W"]], true);
        const linear = new ForbiddenAdjacencyConstraint([["W", "W"]], false);

        expect(wrapping.validate(strip)).toHaveLength(1);
        expect(linear.validate(strip)).toEqual([]);
    });

    test("does not collide symbol IDs containing the pair-key separator", () => {
        // Naively joining a sorted pair with "," would turn both ["A,B", "C"] and ["A", "B,C"] into
        // the same key ("A,B,C"), so the forbidden pair ["A,B", "C"] must not also forbid "A" next to
        // "B,C" — they are four distinct symbols split two different ways.
        const constraint = new ForbiddenAdjacencyConstraint([["A,B", "C"]]);
        const strip = new ReelStrip(["A", "B,C"]);

        expect(constraint.validate(strip)).toEqual([]);
    });

    test("still detects the genuine forbidden pair when a symbol ID contains the separator", () => {
        const constraint = new ForbiddenAdjacencyConstraint([["A,B", "C"]]);
        const strip = new ReelStrip(["A,B", "C", "X"]);

        expect(constraint.validate(strip)).toHaveLength(1);
    });

    describe("directed adjacency", () => {
        // wrapAround = false throughout, so the strip has exactly one adjacent pair (position 0 -> 1)
        // and the wrap transition never muddies which direction is being tested.
        const strip = new ReelStrip(["B", "A"]); // B immediately followed by A; A is not followed by B

        test("directed = true only forbids the declared order, not the reverse", () => {
            const forbidAThenB = new ForbiddenAdjacencyConstraint([["A", "B"]], false, true);
            expect(forbidAThenB.validate(strip)).toEqual([]); // strip has B->A, not A->B

            const forbidBThenA = new ForbiddenAdjacencyConstraint([["B", "A"]], false, true);
            expect(forbidBThenA.validate(strip)).toHaveLength(1);
        });

        test("directed = false (default) forbids the pair regardless of which order it was declared in", () => {
            const constraint = new ForbiddenAdjacencyConstraint([["A", "B"]], false);
            expect(constraint.validate(strip)).toHaveLength(1);
        });
    });
});
