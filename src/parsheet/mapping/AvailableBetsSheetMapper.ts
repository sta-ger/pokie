import type {ValidationIssue} from "../../validation/ValidationIssue.js";
import type {SheetGrid} from "../SheetGrid.js";
import type {AvailableBetsSheetMapping} from "./AvailableBetsSheetMapping.js";
import {cellToNumber, isBlankRow, resolveColumnIndexes} from "./sheetCellParsing.js";

const COLUMNS = ["Bet"];

export class AvailableBetsSheetMapper implements AvailableBetsSheetMapping {
    public readonly sheetName = "AvailableBets";

    public fromRows(rows: SheetGrid): {value: number[]; issues: ValidationIssue[]} {
        const issues: ValidationIssue[] = [];
        const [header, ...dataRows] = rows;
        const columns = resolveColumnIndexes(header ?? [], COLUMNS, this.sheetName, issues);
        const betIndex = columns.Bet;

        const availableBets: number[] = [];
        if (betIndex !== undefined) {
            dataRows.forEach((row, rowOffset) => {
                if (isBlankRow(row)) {
                    return;
                }
                const rowNumber = rowOffset + 2;
                const bet = cellToNumber(row[betIndex]);
                if (bet === undefined) {
                    issues.push({
                        code: "parsheet-availablebets-invalid-cell",
                        severity: "error",
                        message: `Sheet "${this.sheetName}", row ${rowNumber}: "Bet" is not a number, so this row is ignored.`,
                        details: {sheet: this.sheetName, row: rowNumber},
                    });
                    return;
                }
                availableBets.push(bet);
            });
        }

        return {value: availableBets, issues};
    }

    public toRows(availableBets: number[]): SheetGrid {
        return [COLUMNS, ...availableBets.map((bet) => [bet])];
    }
}
