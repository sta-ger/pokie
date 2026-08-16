import {ReelStrip, StackConstraint} from "pokie";

describe("StackConstraint", () => {
    it("enforces fixed/range stack counts, spacing, and visible-window limits", () => {
        const constraint = new StackConstraint(2, 3, 1, 1, ["A"], 5, 3, 2);

        expect(constraint.validate(new ReelStrip(["A", "A", "B", "B", "A", "A", "A", "B"]))).toEqual(
            expect.arrayContaining([
                expect.objectContaining({constraintId: "stack", message: expect.stringContaining("Found 2 stack")}),
                expect.objectContaining({constraintId: "stack", message: expect.stringContaining("below 5")}),
                expect.objectContaining({constraintId: "stack", message: expect.stringContaining("Visible window")}),
            ]),
        );
    });

    it("makes a no-stacks rule explicit without rejecting isolated symbols", () => {
        const noStacks = new StackConstraint(2, Infinity, 0, 0, ["A"]);

        expect(noStacks.validate(new ReelStrip(["A", "B", "A", "B"]))).toEqual([]);
        expect(noStacks.validate(new ReelStrip(["A", "A", "B", "B"]))).toEqual(
            expect.arrayContaining([expect.objectContaining({constraintId: "stack"})]),
        );
    });
});
