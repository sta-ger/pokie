import type {ValidationIssue} from "../../validation/ValidationIssue.js";
import type {SheetGrid} from "../SheetGrid.js";
import type {PaylinesSheetMapping} from "./PaylinesSheetMapping.js";
import {cellToNumber, cellToText, isBlankRow, resolveExpectedReelCount, resolveReelColumns} from "./sheetCellParsing.js";

const LINE_COLUMN = "Line";

export class PaylinesSheetMapper implements PaylinesSheetMapping {
    public readonly sheetName = "Paylines";

    public fromRows(rows: SheetGrid, reels: number): {value: number[][]; issues: ValidationIssue[]} {
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

        const reelColumns = resolveReelColumns(headerRow, this.sheetName, issues, reels, lineIndex !== -1 ? new Set([lineIndex]) : undefined);
        const columnIndexByReelIndex = new Map(reelColumns.map((column) => [column.reelIndex, column.columnIndex]));
        // Same expected-count logic resolveReelColumns uses internally, so a missing trailing reel
        // (not just an interior gap) still makes every payline row invalid, not silently truncated.
        const maxReelIndex = resolveExpectedReelCount(reels, reelColumns);

        const paylines: number[][] = [];
        dataRows.forEach((row, rowOffset) => {
            if (isBlankRow(row)) {
                return;
            }
            const rowNumber = rowOffset + 2;
            const line: number[] = [];
            let valid = true;
            for (let reelIndex = 1; reelIndex <= maxReelIndex; reelIndex++) {
                const columnIndex = columnIndexByReelIndex.get(reelIndex);
                if (columnIndex === undefined) {
                    // A missing "Reel <reelIndex>" column was already reported by resolveReelColumns
                    // — there is no cell to read, so this payline can't be assembled at all.
                    valid = false;
                    continue;
                }
                const value = cellToNumber(row[columnIndex]);
                if (value === undefined || !Number.isInteger(value)) {
                    issues.push({
                        code: "parsheet-payline-invalid-cell",
                        severity: "error",
                        message: `Sheet "${this.sheetName}", row ${rowNumber}: reel ${reelIndex} is not a whole number, so this payline is ignored.`,
                        details: {sheet: this.sheetName, row: rowNumber, reelIndex},
                    });
                    valid = false;
                    continue;
                }
                line.push(value);
            }
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
