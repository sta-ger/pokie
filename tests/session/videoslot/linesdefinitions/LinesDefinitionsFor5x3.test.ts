import {LinesDefinitionsFor5x3} from "pokie";

describe("LinesDefinitionsFor5x3", () => {
    const lines = new LinesDefinitionsFor5x3();

    it("has 25 lines, each a 5-reel row-index definition within a 3-row grid", () => {
        const ids = lines.getLinesIds();
        expect(ids).toHaveLength(25);
        ids.forEach((id) => {
            const definition = lines.getLineDefinition(id);
            expect(definition).toHaveLength(5);
            definition.forEach((row) => expect([0, 1, 2]).toContain(row));
        });
    });

    it("has no duplicate line shapes", () => {
        const shapes = lines.getLinesIds().map((id) => lines.getLineDefinition(id).join(","));
        expect(new Set(shapes).size).toBe(shapes.length);
    });

    it("includes the classic flat, V, and M/W arch lines", () => {
        const shapes = lines.getLinesIds().map((id) => lines.getLineDefinition(id));
        expect(shapes).toEqual(
            expect.arrayContaining([
                [1, 1, 1, 1, 1],
                [0, 0, 0, 0, 0],
                [2, 2, 2, 2, 2],
                [0, 1, 2, 1, 0],
                [2, 1, 0, 1, 2],
                [1, 0, 0, 0, 1],
                [1, 2, 2, 2, 1],
                [0, 2, 0, 2, 0],
                [2, 0, 2, 0, 2],
            ]),
        );
    });
});
