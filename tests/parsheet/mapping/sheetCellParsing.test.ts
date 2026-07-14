import type {ValidationIssue} from "../../../src/validation/ValidationIssue.js";
import {cellToBoolean, cellToNumber, cellToText, isBlankRow, resolveColumnIndexes, resolveReelColumns} from "../../../src/parsheet/mapping/sheetCellParsing.js";

describe("sheetCellParsing", () => {
    describe("cellToText", () => {
        it("trims strings and returns undefined for blank/null/undefined", () => {
            expect(cellToText("  A  ")).toBe("A");
            expect(cellToText("")).toBeUndefined();
            expect(cellToText("   ")).toBeUndefined();
            expect(cellToText(null)).toBeUndefined();
            expect(cellToText(undefined)).toBeUndefined();
        });

        it("stringifies non-string values", () => {
            expect(cellToText(5)).toBe("5");
            expect(cellToText(true)).toBe("true");
        });
    });

    describe("cellToNumber", () => {
        it("passes through finite numbers", () => {
            expect(cellToNumber(5)).toBe(5);
            expect(cellToNumber(-2.5)).toBe(-2.5);
        });

        it("parses numeric strings", () => {
            expect(cellToNumber("5")).toBe(5);
            expect(cellToNumber(" 5 ")).toBe(5);
        });

        it("returns undefined for non-numeric or blank values", () => {
            expect(cellToNumber("abc")).toBeUndefined();
            expect(cellToNumber("")).toBeUndefined();
            expect(cellToNumber(undefined)).toBeUndefined();
            expect(cellToNumber(NaN)).toBeUndefined();
            expect(cellToNumber(Infinity)).toBeUndefined();
        });
    });

    describe("cellToBoolean", () => {
        it("passes through real booleans", () => {
            expect(cellToBoolean(true)).toBe(true);
            expect(cellToBoolean(false)).toBe(false);
        });

        it("treats a blank cell as false", () => {
            expect(cellToBoolean(undefined)).toBe(false);
            expect(cellToBoolean(null)).toBe(false);
        });

        it("recognizes common true/false text spellings, case-insensitively", () => {
            expect(cellToBoolean("TRUE")).toBe(true);
            expect(cellToBoolean("yes")).toBe(true);
            expect(cellToBoolean("x")).toBe(true);
            expect(cellToBoolean(1)).toBe(true);
            expect(cellToBoolean("no")).toBe(false);
            expect(cellToBoolean(0)).toBe(false);
        });

        it("returns undefined for an unrecognizable value", () => {
            expect(cellToBoolean("maybe")).toBeUndefined();
        });
    });

    describe("isBlankRow", () => {
        it("is true only when every cell is blank", () => {
            expect(isBlankRow([])).toBe(true);
            expect(isBlankRow([undefined, "", null])).toBe(true);
            expect(isBlankRow(["", "A"])).toBe(false);
        });
    });

    describe("resolveColumnIndexes", () => {
        it("resolves expected columns case-insensitively and reports unknown ones", () => {
            const issues: ValidationIssue[] = [];
            const found = resolveColumnIndexes(["symbol", "Extra"], ["Symbol"], "Symbols", issues);

            expect(found).toEqual({Symbol: 0});
            expect(issues).toEqual([expect.objectContaining({code: "parsheet-unknown-column", severity: "warning"})]);
        });

        it("reports a missing required column", () => {
            const issues: ValidationIssue[] = [];
            resolveColumnIndexes([], ["Symbol"], "Symbols", issues);

            expect(issues).toEqual([expect.objectContaining({code: "parsheet-missing-column", severity: "error"})]);
        });
    });

    describe("resolveReelColumns", () => {
        it("resolves canonical Reel 1..Reel N headers in physical column order", () => {
            const issues: ValidationIssue[] = [];
            const columns = resolveReelColumns(["Reel 1", "Reel 2", "Reel 3"], "ReelStrips", issues);

            expect(columns).toEqual([
                {reelIndex: 1, columnIndex: 0},
                {reelIndex: 2, columnIndex: 1},
                {reelIndex: 3, columnIndex: 2},
            ]);
            expect(issues).toEqual([]);
        });

        it("resolves out-of-order Reel headers by reelIndex, not physical column order", () => {
            const issues: ValidationIssue[] = [];
            const columns = resolveReelColumns(["Reel 2", "Reel 1"], "ReelStrips", issues);

            expect(columns).toEqual([
                {reelIndex: 1, columnIndex: 1},
                {reelIndex: 2, columnIndex: 0},
            ]);
        });

        it("reports an unknown column and excludes it from the result", () => {
            const issues: ValidationIssue[] = [];
            const columns = resolveReelColumns(["Reel 1", "Notes", "Reel 2"], "ReelStrips", issues);

            expect(columns).toEqual([
                {reelIndex: 1, columnIndex: 0},
                {reelIndex: 2, columnIndex: 2},
            ]);
            expect(issues).toEqual([
                expect.objectContaining({code: "parsheet-unknown-column", severity: "warning", details: {sheet: "ReelStrips", column: "Notes"}}),
            ]);
        });

        it("reports a duplicate Reel column and only uses the first occurrence", () => {
            const issues: ValidationIssue[] = [];
            const columns = resolveReelColumns(["Reel 1", "Reel 1", "Reel 2"], "ReelStrips", issues);

            expect(columns).toEqual([
                {reelIndex: 1, columnIndex: 0},
                {reelIndex: 2, columnIndex: 2},
            ]);
            expect(issues).toEqual([expect.objectContaining({code: "parsheet-reel-column-duplicate", severity: "error", details: {sheet: "ReelStrips", reelIndex: 1}})]);
        });

        it("reports every missing Reel index in the 1..maxReelIndex sequence", () => {
            const issues: ValidationIssue[] = [];
            const columns = resolveReelColumns(["Reel 1", "Reel 4"], "ReelStrips", issues);

            expect(columns).toEqual([
                {reelIndex: 1, columnIndex: 0},
                {reelIndex: 4, columnIndex: 1},
            ]);
            expect(issues).toEqual([
                expect.objectContaining({code: "parsheet-reel-column-missing", severity: "error", details: {sheet: "ReelStrips", reelIndex: 2}}),
                expect.objectContaining({code: "parsheet-reel-column-missing", severity: "error", details: {sheet: "ReelStrips", reelIndex: 3}}),
            ]);
        });

        it("ignores the given column indexes entirely (e.g. Paylines' own Line column)", () => {
            const issues: ValidationIssue[] = [];
            const columns = resolveReelColumns(["Line", "Reel 1"], "Paylines", issues, new Set([0]));

            expect(columns).toEqual([{reelIndex: 1, columnIndex: 1}]);
            expect(issues).toEqual([]);
        });

        it("returns nothing for an empty header row, without any missing-column diagnostics", () => {
            const issues: ValidationIssue[] = [];
            const columns = resolveReelColumns([], "ReelStrips", issues);

            expect(columns).toEqual([]);
            expect(issues).toEqual([]);
        });
    });
});
