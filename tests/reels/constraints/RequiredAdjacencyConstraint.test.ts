import {ReelStrip, RequiredAdjacencyConstraint} from "pokie";

describe("RequiredAdjacencyConstraint", () => {
    test("is silent (undirected, default) when every subject occurrence has a required neighbor on either side", () => {
        const constraint = new RequiredAdjacencyConstraint([["W", "M"]]);
        const strip = new ReelStrip(["M", "W", "M"]);

        expect(constraint.validate(strip)).toEqual([]);
    });

    test("flags a subject occurrence whose neighbors (undirected) include no required neighbor", () => {
        const constraint = new RequiredAdjacencyConstraint([["W", "M"]], false, false);
        const strip = new ReelStrip(["X", "W", "Y"]);

        const violations = constraint.validate(strip);
        expect(violations).toHaveLength(1);
        expect(violations[0]).toMatchObject({
            constraintId: "required-adjacency",
            positions: [1, 0, 2],
            details: {subject: "W", position: 1, requiredNeighbors: ["M"], actualNeighbors: ["X", "Y"]},
        });
    });

    test("a symbol never declared as a subject is never inspected at all", () => {
        const constraint = new RequiredAdjacencyConstraint([["W", "M"]]); // "W" never appears below
        const strip = new ReelStrip(["Q", "Q", "Q"]);

        expect(constraint.validate(strip)).toEqual([]);
    });

    test("multiple required pairs for the same subject accumulate into an OR of acceptable neighbors", () => {
        const constraint = new RequiredAdjacencyConstraint(
            [
                ["W", "M"],
                ["W", "X"],
            ],
            true,
            false,
        );
        const strip = new ReelStrip(["W", "X"]);

        expect(constraint.validate(strip)).toEqual([]);
    });

    describe("directed adjacency", () => {
        test("directed = true is satisfied only when the subject is immediately followed by a required neighbor", () => {
            const constraint = new RequiredAdjacencyConstraint([["W", "M"]], true, false);
            const strip = new ReelStrip(["W", "M", "X"]);

            expect(constraint.validate(strip)).toEqual([]);
        });

        test("directed = true flags a subject whose next symbol is not a required neighbor", () => {
            const constraint = new RequiredAdjacencyConstraint([["W", "M"]], true, false);
            const strip = new ReelStrip(["W", "X"]);

            const violations = constraint.validate(strip);
            expect(violations).toHaveLength(1);
            expect(violations[0].positions).toEqual([0, 1]);
        });

        test("directed = true + wrapAround = false: a subject at the last position has no next neighbor at all", () => {
            const constraint = new RequiredAdjacencyConstraint([["W", "M"]], true, false);
            const strip = new ReelStrip(["X", "W"]);

            const violations = constraint.validate(strip);
            expect(violations).toHaveLength(1);
            expect(violations[0]).toMatchObject({positions: [1], details: {actualNeighbors: []}});
        });

        test("directed = true + wrapAround = true: the last subject's next neighbor wraps to the first position", () => {
            const constraint = new RequiredAdjacencyConstraint([["W", "M"]], true, true);
            const strip = new ReelStrip(["M", "X", "W"]);

            expect(constraint.validate(strip)).toEqual([]);
        });
    });
});
