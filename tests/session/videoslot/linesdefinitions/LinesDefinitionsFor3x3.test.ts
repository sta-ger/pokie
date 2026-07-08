import {LinesDefinitionsFor3x3} from "pokie";

describe("LinesDefinitionsFor3x3", () => {
    const lines = new LinesDefinitionsFor3x3();

    it("has 11 lines, each a 3-reel row-index definition within a 3-row grid", () => {
        const ids = lines.getLinesIds();
        expect(ids).toHaveLength(11);
        ids.forEach((id) => {
            const definition = lines.getLineDefinition(id);
            expect(definition).toHaveLength(3);
            definition.forEach((row) => expect([0, 1, 2]).toContain(row));
        });
    });

    it("has no duplicate line shapes", () => {
        const shapes = lines.getLinesIds().map((id) => lines.getLineDefinition(id).join(","));
        expect(new Set(shapes).size).toBe(shapes.length);
    });

    it("contains every mirror-symmetric line shape possible on a 3-reel grid", () => {
        const shapes = new Set(lines.getLinesIds().map((id) => lines.getLineDefinition(id).join(",")));
        const expectedSymmetricShapes: number[][] = [];
        for (let a = 0; a <= 2; a++) {
            for (let b = 0; b <= 2; b++) {
                expectedSymmetricShapes.push([a, b, a]); // palindromic: flat (a === b) or single-reel notch
            }
        }
        expectedSymmetricShapes.push([0, 1, 2], [2, 1, 0]); // the two full diagonals (not palindromic, but symmetric line-of-sight shapes)

        expect(shapes.size).toBe(expectedSymmetricShapes.length);
        expectedSymmetricShapes.forEach((shape) => {
            expect(shapes.has(shape.join(","))).toBe(true);
        });
    });
});
