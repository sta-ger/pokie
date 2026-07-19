import type {BetMode} from "../../gamepackage/BetMode.js";
import type {ValidationIssue} from "../../validation/ValidationIssue.js";
import type {SheetGrid} from "../SheetGrid.js";
import type {BetModesSheetMapping} from "./BetModesSheetMapping.js";
import {cellToNumber, cellToText, isBlankRow, resolveColumnIndexes} from "./sheetCellParsing.js";

const COLUMNS = ["Id", "Label", "Cost Multiplier"];

export class BetModesSheetMapper implements BetModesSheetMapping {
    public readonly sheetName = "BetModes";

    public fromRows(rows: SheetGrid): {value: BetMode[]; issues: ValidationIssue[]} {
        const issues: ValidationIssue[] = [];
        const [header, ...dataRows] = rows;
        const columns = resolveColumnIndexes(header ?? [], COLUMNS, this.sheetName, issues);
        const idIndex = columns.Id;
        const labelIndex = columns.Label;
        const costIndex = columns["Cost Multiplier"];

        const betModes: BetMode[] = [];
        if (idIndex !== undefined && labelIndex !== undefined && costIndex !== undefined) {
            dataRows.forEach((row, rowOffset) => {
                if (isBlankRow(row)) {
                    return;
                }
                const rowNumber = rowOffset + 2;
                const id = cellToText(row[idIndex]);
                if (id === undefined) {
                    issues.push({
                        code: "parsheet-betmodes-missing-id",
                        severity: "error",
                        message: `Sheet "${this.sheetName}", row ${rowNumber}: "Id" is blank, so this row is ignored.`,
                        details: {sheet: this.sheetName, row: rowNumber},
                    });
                    return;
                }

                const rawCost = row[costIndex];
                const costMultiplier = cellToNumber(rawCost);
                if (cellToText(rawCost) !== undefined && costMultiplier === undefined) {
                    issues.push({
                        code: "parsheet-betmodes-invalid-cost-multiplier-cell",
                        severity: "error",
                        message: `Sheet "${this.sheetName}", row ${rowNumber}: "Cost Multiplier" is not a number, so this row is ignored.`,
                        details: {sheet: this.sheetName, row: rowNumber, id},
                    });
                    return;
                }

                const betMode: BetMode = {id};
                const label = cellToText(row[labelIndex]);
                if (label !== undefined) {
                    betMode.label = label;
                }
                if (costMultiplier !== undefined) {
                    betMode.costMultiplier = costMultiplier;
                }
                betModes.push(betMode);
            });
        }

        return {value: betModes, issues};
    }

    public toRows(betModes: BetMode[]): SheetGrid {
        return [COLUMNS, ...betModes.map((mode) => [mode.id, mode.label ?? "", mode.costMultiplier ?? ""])];
    }
}
