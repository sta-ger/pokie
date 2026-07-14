import type {ValidationIssue} from "../../validation/ValidationIssue.js";
import type {SheetGrid} from "../SheetGrid.js";
import type {ReelStripsSheetMapping} from "./ReelStripsSheetMapping.js";
import {cellToText, resolveReelColumns} from "./sheetCellParsing.js";

export class ReelStripsSheetMapper implements ReelStripsSheetMapping {
    public readonly sheetName = "ReelStrips";

    public fromRows(rows: SheetGrid): {value: string[][]; issues: ValidationIssue[]} {
        const issues: ValidationIssue[] = [];
        const [header, ...dataRows] = rows;
        const reelColumns = resolveReelColumns(header ?? [], this.sheetName, issues);
        const columnIndexByReelIndex = new Map(reelColumns.map((column) => [column.reelIndex, column.columnIndex]));
        const maxReelIndex = reelColumns.length > 0 ? Math.max(...reelColumns.map((column) => column.reelIndex)) : 0;

        const reelStrips: string[][] = [];
        for (let reelIndex = 1; reelIndex <= maxReelIndex; reelIndex++) {
            const columnIndex = columnIndexByReelIndex.get(reelIndex);
            if (columnIndex === undefined) {
                // A missing "Reel <reelIndex>" column was already reported by resolveReelColumns —
                // an empty placeholder strip keeps reelStrips[reelIndex - 1] positionally correct
                // rather than silently shrinking the array.
                reelStrips.push([]);
                continue;
            }

            const strip: string[] = [];
            let sawBlank = false;
            dataRows.forEach((row, rowOffset) => {
                const cellText = cellToText(row[columnIndex]);
                if (cellText === undefined) {
                    sawBlank = true;
                    return;
                }
                if (sawBlank) {
                    issues.push({
                        code: "parsheet-reelstrips-gap",
                        severity: "error",
                        message: `Sheet "${this.sheetName}", reel ${reelIndex}: row ${rowOffset + 2} has a value after a blank cell earlier in the column — a reel strip must not have gaps.`,
                        details: {sheet: this.sheetName, reelIndex, row: rowOffset + 2},
                    });
                }
                strip.push(cellText);
            });
            reelStrips.push(strip);
        }

        return {value: reelStrips, issues};
    }

    public toRows(reelStrips: string[][]): SheetGrid {
        const header = reelStrips.map((_, index) => `Reel ${index + 1}`);
        const maxLength = Math.max(0, ...reelStrips.map((strip) => strip.length));
        const rows: SheetGrid = [header];
        for (let position = 0; position < maxLength; position++) {
            rows.push(reelStrips.map((strip) => strip[position] ?? ""));
        }
        return rows;
    }
}
