import type {ValidationIssue} from "../../../src/validation/ValidationIssue.js";
import {cellToBoolean, cellToNumber, cellToText, isBlankRow, resolveColumnIndexes} from "../../../src/parsheet/mapping/sheetCellParsing.js";

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
});
