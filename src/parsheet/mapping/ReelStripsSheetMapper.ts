import type {ValidationIssue} from "../../validation/ValidationIssue.js";
import type {SheetGrid} from "../SheetGrid.js";
import type {ReelStripsSheetMapping} from "./ReelStripsSheetMapping.js";
import {cellToText} from "./sheetCellParsing.js";

export class ReelStripsSheetMapper implements ReelStripsSheetMapping {
    public readonly sheetName = "ReelStrips";

    public fromRows(rows: SheetGrid): {value: string[][]; issues: ValidationIssue[]} {
        const issues: ValidationIssue[] = [];
        const [header, ...dataRows] = rows;
        const reelColumns: number[] = [];
        (header ?? []).forEach((cell, index) => {
            if (cellToText(cell) !== undefined) {
                reelColumns.push(index);
            }
        });

        const reelStrips = reelColumns.map((columnIndex, reelIndex) => {
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
                        message: `Sheet "${this.sheetName}", reel ${reelIndex + 1}: row ${rowOffset + 2} has a value after a blank cell earlier in the column — a reel strip must not have gaps.`,
                        details: {sheet: this.sheetName, reelIndex, row: rowOffset + 2},
                    });
                }
                strip.push(cellText);
            });
            return strip;
        });

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
