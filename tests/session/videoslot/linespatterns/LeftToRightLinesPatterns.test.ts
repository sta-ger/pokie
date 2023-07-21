import {LeftToRightLinesPatterns} from "pokie";

describe("LeftToRightLinesPatterns", () => {
    it("contains lines patterns that describe winning symbols from left to right", () => {
        const patterns = new LeftToRightLinesPatterns(5);
        expect(patterns.toArray()).toEqual([
            [1, 1, 1, 1, 1],
            [1, 1, 1, 1, 0],
            [1, 1, 1, 0, 0],
            [1, 1, 0, 0, 0],
        ]);
    });
});
