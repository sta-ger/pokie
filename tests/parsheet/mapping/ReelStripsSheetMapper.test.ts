import {ReelStripsSheetMapper} from "../../../src/parsheet/mapping/ReelStripsSheetMapper.js";

describe("ReelStripsSheetMapper", () => {
    const mapper = new ReelStripsSheetMapper();

    it("maps one column per reel to one strip per reel", () => {
        const {value, issues} = mapper.fromRows([
            ["Reel 1", "Reel 2"],
            ["A", "K"],
            ["K", "A"],
            ["A", "Q"],
        ]);

        expect(issues).toEqual([]);
        expect(value).toEqual([
            ["A", "K", "A"],
            ["K", "A", "Q"],
        ]);
    });

    it("allows a ragged (shorter) reel via trailing blank cells", () => {
        const {value, issues} = mapper.fromRows([
            ["Reel 1", "Reel 2"],
            ["A", "K"],
            ["K", ""],
        ]);

        expect(issues).toEqual([]);
        expect(value).toEqual([
            ["A", "K"],
            ["K"],
        ]);
    });

    it("reports a gap: a blank cell followed by a non-blank one further down the same column", () => {
        const {value, issues} = mapper.fromRows([
            ["Reel 1"],
            ["A"],
            [""],
            ["K"],
        ]);

        expect(value).toEqual([["A", "K"]]);
        expect(issues).toEqual([expect.objectContaining({code: "parsheet-reelstrips-gap", severity: "error"})]);
    });

    it("returns an empty array when there is no header row", () => {
        const {value, issues} = mapper.fromRows([]);

        expect(value).toEqual([]);
        expect(issues).toEqual([]);
    });

    it("ignores an unrecognized column header — it never becomes reel data", () => {
        const {value, issues} = mapper.fromRows([
            ["Reel 1", "Notes", "Reel 2"],
            ["A", "ignore me", "K"],
            ["K", "also ignore", "A"],
        ]);

        expect(value).toEqual([
            ["A", "K"],
            ["K", "A"],
        ]);
        expect(issues).toEqual([expect.objectContaining({code: "parsheet-unknown-column", severity: "warning"})]);
    });

    it("reports a duplicate Reel column and only uses the first occurrence's data", () => {
        const {value, issues} = mapper.fromRows([
            ["Reel 1", "Reel 1"],
            ["A", "Z"],
            ["K", "Z"],
        ]);

        expect(value).toEqual([["A", "K"]]);
        expect(issues).toEqual([expect.objectContaining({code: "parsheet-reel-column-duplicate", severity: "error"})]);
    });

    it("reports a missing Reel column and keeps its slot as an empty placeholder strip", () => {
        const {value, issues} = mapper.fromRows([
            ["Reel 1", "Reel 3"],
            ["A", "Q"],
            ["K", "J"],
        ]);

        expect(value).toEqual([["A", "K"], [], ["Q", "J"]]);
        expect(issues).toEqual([expect.objectContaining({code: "parsheet-reel-column-missing", severity: "error", details: {sheet: "ReelStrips", reelIndex: 2}})]);
    });

    it("round-trips toRows -> fromRows back to the original strips, including a ragged reel", () => {
        const original = [
            ["A", "K", "Q"],
            ["K", "A"],
        ];
        const {value, issues} = mapper.fromRows(mapper.toRows(original));

        expect(issues).toEqual([]);
        expect(value).toEqual(original);
    });
});
