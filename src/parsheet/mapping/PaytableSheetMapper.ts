import type {ValidationIssue} from "../../validation/ValidationIssue.js";
import type {SheetGrid} from "../SheetGrid.js";
import type {ParSheetPaytable, PaytableSheetMapping} from "./PaytableSheetMapping.js";
import {cellToNumber, cellToText, isBlankRow, resolveColumnIndexes} from "./sheetCellParsing.js";

const COLUMNS = ["Symbol", "Matches", "Multiplier"];

export class PaytableSheetMapper implements PaytableSheetMapping {
    public readonly sheetName = "Paytable";

    public fromRows(rows: SheetGrid): {value: ParSheetPaytable; issues: ValidationIssue[]} {
        const issues: ValidationIssue[] = [];
        const [header, ...dataRows] = rows;
        const columns = resolveColumnIndexes(header ?? [], COLUMNS, this.sheetName, issues);
        const symbolIndex = columns.Symbol;
        const matchesIndex = columns.Matches;
        const multiplierIndex = columns.Multiplier;

        const paytable: ParSheetPaytable = {};
        if (symbolIndex !== undefined && matchesIndex !== undefined && multiplierIndex !== undefined) {
            dataRows.forEach((row, rowOffset) => {
                if (isBlankRow(row)) {
                    return;
                }
                const rowNumber = rowOffset + 2;
                const symbol = cellToText(row[symbolIndex]);
                if (symbol === undefined) {
                    issues.push({
                        code: "parsheet-paytable-missing-symbol",
                        severity: "error",
                        message: `Sheet "${this.sheetName}", row ${rowNumber}: "Symbol" is blank, so this row is ignored.`,
                        details: {sheet: this.sheetName, row: rowNumber},
                    });
                    return;
                }

                const matches = cellToNumber(row[matchesIndex]);
                if (matches === undefined) {
                    issues.push({
                        code: "parsheet-paytable-invalid-matches-cell",
                        severity: "error",
                        message: `Sheet "${this.sheetName}", row ${rowNumber}: "Matches" is not a number, so this row is ignored.`,
                        details: {sheet: this.sheetName, row: rowNumber, symbol},
                    });
                    return;
                }

                const multiplier = cellToNumber(row[multiplierIndex]);
                if (multiplier === undefined) {
                    issues.push({
                        code: "parsheet-paytable-invalid-multiplier-cell",
                        severity: "error",
                        message: `Sheet "${this.sheetName}", row ${rowNumber}: "Multiplier" is not a number, so this row is ignored.`,
                        details: {sheet: this.sheetName, row: rowNumber, symbol},
                    });
                    return;
                }

                if (!(symbol in paytable)) {
                    paytable[symbol] = {};
                }
                const symbolPayouts = paytable[symbol];
                const matchesKey = String(matches);
                if (matchesKey in symbolPayouts) {
                    issues.push({
                        code: "parsheet-paytable-duplicate-entry",
                        severity: "warning",
                        message: `Sheet "${this.sheetName}" has more than one row for "${symbol}" at ${matches} matches; the last one is used.`,
                        details: {sheet: this.sheetName, row: rowNumber, symbol, matches},
                    });
                }
                symbolPayouts[matchesKey] = multiplier;
            });
        }

        return {value: paytable, issues};
    }

    public toRows(paytable: ParSheetPaytable): SheetGrid {
        const rows: SheetGrid = [COLUMNS];
        for (const [symbol, payouts] of Object.entries(paytable)) {
            const matchCounts = Object.keys(payouts)
                .map(Number)
                .sort((a, b) => a - b);
            for (const matches of matchCounts) {
                rows.push([symbol, matches, payouts[String(matches)]]);
            }
        }
        return rows;
    }
}
