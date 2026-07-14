import type {ValidationIssue} from "../../validation/ValidationIssue.js";
import type {SheetGrid} from "../SheetGrid.js";
import type {SymbolsSheetMapping, SymbolsSheetValue} from "./SymbolsSheetMapping.js";
import {cellToBoolean, cellToText, isBlankRow, resolveColumnIndexes} from "./sheetCellParsing.js";

const COLUMNS = ["Symbol", "Wild", "Scatter"];

export class SymbolsSheetMapper implements SymbolsSheetMapping {
    public readonly sheetName = "Symbols";

    public fromRows(rows: SheetGrid): {value: SymbolsSheetValue; issues: ValidationIssue[]} {
        const issues: ValidationIssue[] = [];
        const [header, ...dataRows] = rows;
        const columns = resolveColumnIndexes(header ?? [], COLUMNS, this.sheetName, issues);
        const symbolIndex = columns.Symbol;
        const wildIndex = columns.Wild;
        const scatterIndex = columns.Scatter;

        const symbols: string[] = [];
        const wilds: string[] = [];
        const scatters: string[] = [];

        if (symbolIndex !== undefined) {
            dataRows.forEach((row, rowOffset) => {
                if (isBlankRow(row)) {
                    return;
                }
                const rowNumber = rowOffset + 2; // +1 for the header row, +1 to become 1-based.
                const symbol = cellToText(row[symbolIndex]);
                if (symbol === undefined) {
                    issues.push({
                        code: "parsheet-symbol-missing-id",
                        severity: "error",
                        message: `Sheet "${this.sheetName}", row ${rowNumber}: "Symbol" is blank, so this row is ignored.`,
                        details: {sheet: this.sheetName, row: rowNumber},
                    });
                    return;
                }
                symbols.push(symbol);

                const wild = wildIndex !== undefined ? cellToBoolean(row[wildIndex]) : false;
                if (wild === undefined) {
                    issues.push({
                        code: "parsheet-symbol-invalid-flag",
                        severity: "error",
                        message: `Sheet "${this.sheetName}", row ${rowNumber}: "Wild" is not a recognizable true/false value.`,
                        details: {sheet: this.sheetName, row: rowNumber, symbol},
                    });
                } else if (wild) {
                    wilds.push(symbol);
                }

                const scatter = scatterIndex !== undefined ? cellToBoolean(row[scatterIndex]) : false;
                if (scatter === undefined) {
                    issues.push({
                        code: "parsheet-symbol-invalid-flag",
                        severity: "error",
                        message: `Sheet "${this.sheetName}", row ${rowNumber}: "Scatter" is not a recognizable true/false value.`,
                        details: {sheet: this.sheetName, row: rowNumber, symbol},
                    });
                } else if (scatter) {
                    scatters.push(symbol);
                }
            });
        }

        return {value: {symbols, wilds, scatters}, issues};
    }

    public toRows(value: SymbolsSheetValue): SheetGrid {
        const wildSet = new Set(value.wilds);
        const scatterSet = new Set(value.scatters);
        return [COLUMNS, ...value.symbols.map((symbol) => [symbol, wildSet.has(symbol), scatterSet.has(symbol)])];
    }
}
