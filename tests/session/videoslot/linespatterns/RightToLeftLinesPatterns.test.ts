import {RightToLeftLinesPatterns} from "../../../../src/session/videoslot/linespatterns/RightToLeftLinesPatterns.js";

describe("RightToLeftLinesPatterns", () => {
    it("contains lines patterns that describe winning symbols from right to left", () => {
        const patterns = new RightToLeftLinesPatterns(5);
        expect(patterns.toArray()).toEqual([
            [1, 1, 1, 1, 1],
            [0, 1, 1, 1, 1],
            [0, 0, 1, 1, 1],
            [0, 0, 0, 1, 1],
        ]);
    });
});
