import {LinesDefinitionsFor5x4} from "pokie";

describe("LinesDefinitionsFor5x4", () => {
    const lines = new LinesDefinitionsFor5x4();

    it("has 16 lines, each a 5-reel row-index definition within a 4-row grid", () => {
        const ids = lines.getLinesIds();
        expect(ids).toHaveLength(16);
        ids.forEach((id) => {
            const definition = lines.getLineDefinition(id);
            expect(definition).toHaveLength(5);
            definition.forEach((row) => expect([0, 1, 2, 3]).toContain(row));
        });
    });

    it("has no duplicate line shapes", () => {
        const shapes = lines.getLinesIds().map((id) => lines.getLineDefinition(id).join(","));
        expect(new Set(shapes).size).toBe(shapes.length);
    });

    it("includes the 4 flat lines and the full-grid staircases", () => {
        const shapes = lines.getLinesIds().map((id) => lines.getLineDefinition(id));
        expect(shapes).toEqual(
            expect.arrayContaining([
                [0, 0, 0, 0, 0],
                [1, 1, 1, 1, 1],
                [2, 2, 2, 2, 2],
                [3, 3, 3, 3, 3],
                [0, 0, 1, 2, 3],
                [0, 1, 2, 3, 3],
                [3, 3, 2, 1, 0],
                [3, 2, 1, 0, 0],
            ]),
        );
    });
});
