import type {ValidationIssue} from "../../validation/ValidationIssue.js";
import type {SheetGrid} from "../SheetGrid.js";
import type {PaylinesSheetMapping} from "./PaylinesSheetMapping.js";
import {cellToNumber, cellToText, isBlankRow} from "./sheetCellParsing.js";

const LINE_COLUMN = "Line";

export class PaylinesSheetMapper implements PaylinesSheetMapping {
    public readonly sheetName = "Paylines";

    public fromRows(rows: SheetGrid): {value: number[][]; issues: ValidationIssue[]} {
        const issues: ValidationIssue[] = [];
        const [header, ...dataRows] = rows;
        const headerRow = header ?? [];
        const lineIndex = headerRow.findIndex((cell) => cellToText(cell)?.toLowerCase() === LINE_COLUMN.toLowerCase());
        if (lineIndex === -1) {
            issues.push({
                code: "parsheet-missing-column",
                severity: "error",
                message: `Sheet "${this.sheetName}" is missing required column "${LINE_COLUMN}".`,
                details: {sheet: this.sheetName, column: LINE_COLUMN},
            });
        }

        const reelColumns: number[] = [];
        headerRow.forEach((cell, index) => {
            if (index !== lineIndex && cellToText(cell) !== undefined) {
                reelColumns.push(index);
            }
        });

        const paylines: number[][] = [];
        dataRows.forEach((row, rowOffset) => {
            if (isBlankRow(row)) {
                return;
            }
            const rowNumber = rowOffset + 2;
            const line: number[] = [];
            let valid = true;
            reelColumns.forEach((columnIndex, reelIndex) => {
                const value = cellToNumber(row[columnIndex]);
                if (value === undefined || !Number.isInteger(value)) {
                    issues.push({
                        code: "parsheet-payline-invalid-cell",
                        severity: "error",
                        message: `Sheet "${this.sheetName}", row ${rowNumber}: reel ${reelIndex + 1} is not a whole number, so this payline is ignored.`,
                        details: {sheet: this.sheetName, row: rowNumber, reelIndex},
                    });
                    valid = false;
                    return;
                }
                line.push(value);
            });
            if (valid) {
                paylines.push(line);
            }
        });

        return {value: paylines, issues};
    }

    public toRows(paylines: number[][]): SheetGrid {
        const reelCount = Math.max(0, ...paylines.map((line) => line.length));
        const header: unknown[] = [LINE_COLUMN, ...Array.from({length: reelCount}, (_, index) => `Reel ${index + 1}`)];
        const rows: SheetGrid = [header];
        paylines.forEach((line, index) => {
            rows.push([index + 1, ...line]);
        });
        return rows;
    }
}
