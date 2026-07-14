import {PaylinesSheetMapper} from "../../../src/parsheet/mapping/PaylinesSheetMapper.js";

describe("PaylinesSheetMapper", () => {
    const mapper = new PaylinesSheetMapper();

    it("maps Line/Reel rows to a paylines array, ignoring the Line label itself", () => {
        const {value, issues} = mapper.fromRows([
            ["Line", "Reel 1", "Reel 2", "Reel 3"],
            [1, 0, 0, 0],
            [2, 1, 1, 1],
        ]);

        expect(issues).toEqual([]);
        expect(value).toEqual([
            [0, 0, 0],
            [1, 1, 1],
        ]);
    });

    it("reports a missing Line column", () => {
        const {issues} = mapper.fromRows([["Reel 1", "Reel 2"]]);

        expect(issues).toEqual([expect.objectContaining({code: "parsheet-missing-column", severity: "error"})]);
    });

    it("reports a non-numeric reel cell and drops that payline", () => {
        const {value, issues} = mapper.fromRows([
            ["Line", "Reel 1", "Reel 2"],
            [1, 0, "top"],
        ]);

        expect(value).toEqual([]);
        expect(issues).toEqual([expect.objectContaining({code: "parsheet-payline-invalid-cell", severity: "error"})]);
    });

    it("skips fully blank rows", () => {
        const {value, issues} = mapper.fromRows([
            ["Line", "Reel 1"],
            ["", ""],
            [1, 0],
        ]);

        expect(issues).toEqual([]);
        expect(value).toEqual([[0]]);
    });

    it("round-trips toRows -> fromRows back to the original paylines", () => {
        const original = [
            [0, 0, 0],
            [1, 1, 1],
            [2, 2, 2],
        ];
        const {value, issues} = mapper.fromRows(mapper.toRows(original));

        expect(issues).toEqual([]);
        expect(value).toEqual(original);
    });
});
