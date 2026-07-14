import {PaylinesSheetMapper} from "../../../src/parsheet/mapping/PaylinesSheetMapper.js";

describe("PaylinesSheetMapper", () => {
    const mapper = new PaylinesSheetMapper();

    it("maps Line/Reel rows to a paylines array, ignoring the Line label itself", () => {
        const {value, issues} = mapper.fromRows(
            [
                ["Line", "Reel 1", "Reel 2", "Reel 3"],
                [1, 0, 0, 0],
                [2, 1, 1, 1],
            ],
            3,
        );

        expect(issues).toEqual([]);
        expect(value).toEqual([
            [0, 0, 0],
            [1, 1, 1],
        ]);
    });

    it("reports a missing Line column", () => {
        const {issues} = mapper.fromRows([["Reel 1", "Reel 2"]], 2);

        expect(issues).toEqual([expect.objectContaining({code: "parsheet-missing-column", severity: "error"})]);
    });

    it("reports a non-numeric reel cell and drops that payline", () => {
        const {value, issues} = mapper.fromRows(
            [
                ["Line", "Reel 1", "Reel 2"],
                [1, 0, "top"],
            ],
            2,
        );

        expect(value).toEqual([]);
        expect(issues).toEqual([expect.objectContaining({code: "parsheet-payline-invalid-cell", severity: "error"})]);
    });

    it("ignores an unrecognized column header — it never becomes reel data", () => {
        const {value, issues} = mapper.fromRows(
            [
                ["Line", "Reel 1", "Notes", "Reel 2"],
                [1, 0, "ignore me", 1],
            ],
            2,
        );

        expect(value).toEqual([[0, 1]]);
        expect(issues).toEqual([expect.objectContaining({code: "parsheet-unknown-column", severity: "warning"})]);
    });

    it("reports a duplicate Reel column and only uses the first occurrence's data", () => {
        const {value, issues} = mapper.fromRows(
            [
                ["Line", "Reel 1", "Reel 1"],
                [1, 0, 2],
            ],
            1,
        );

        expect(value).toEqual([[0]]);
        expect(issues).toEqual([expect.objectContaining({code: "parsheet-reel-column-duplicate", severity: "error"})]);
    });

    it("reports an interior missing Reel column and drops every payline (nothing to read for that reel)", () => {
        const {value, issues} = mapper.fromRows(
            [
                ["Line", "Reel 1", "Reel 3"],
                [1, 0, 0],
            ],
            3,
        );

        expect(value).toEqual([]);
        expect(issues).toEqual(
            expect.arrayContaining([expect.objectContaining({code: "parsheet-reel-column-missing", severity: "error", details: {sheet: "Paylines", reelIndex: 2}})]),
        );
    });

    it("reports every trailing missing Reel column when the sheet has fewer columns than Manifest.Reels", () => {
        const {value, issues} = mapper.fromRows(
            [
                ["Line", "Reel 1", "Reel 2"],
                [1, 0, 0],
            ],
            4,
        );

        expect(value).toEqual([]);
        expect(issues).toEqual(
            expect.arrayContaining([
                expect.objectContaining({code: "parsheet-reel-column-missing", severity: "error", details: {sheet: "Paylines", reelIndex: 3}}),
                expect.objectContaining({code: "parsheet-reel-column-missing", severity: "error", details: {sheet: "Paylines", reelIndex: 4}}),
            ]),
        );
    });

    it("reports an out-of-range Reel column beyond Manifest.Reels and excludes it from paylines", () => {
        const {value, issues} = mapper.fromRows(
            [
                ["Line", "Reel 1", "Reel 2", "Reel 3"],
                [1, 0, 0, 0],
            ],
            2,
        );

        expect(value).toEqual([[0, 0]]);
        expect(issues).toEqual([
            expect.objectContaining({code: "parsheet-reel-column-out-of-range", severity: "error", details: {sheet: "Paylines", reelIndex: 3, reels: 2}}),
        ]);
    });

    it("skips fully blank rows", () => {
        const {value, issues} = mapper.fromRows(
            [
                ["Line", "Reel 1"],
                ["", ""],
                [1, 0],
            ],
            1,
        );

        expect(issues).toEqual([]);
        expect(value).toEqual([[0]]);
    });

    it("round-trips toRows -> fromRows back to the original paylines", () => {
        const original = [
            [0, 0, 0],
            [1, 1, 1],
            [2, 2, 2],
        ];
        const {value, issues} = mapper.fromRows(mapper.toRows(original), 3);

        expect(issues).toEqual([]);
        expect(value).toEqual(original);
    });
});
