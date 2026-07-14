import type {ValidationIssue} from "../../validation/ValidationIssue.js";
import type {SheetGrid} from "../SheetGrid.js";

// Maps the "AvailableBets" sheet (a single "Bet" column, one row per value) to/from GameBlueprint's
// availableBets. Whether a value is positive, or duplicated, is left to GameBlueprintValidator once
// the array is assembled — this only reports a "Bet" cell that isn't a number at all.
export interface AvailableBetsSheetMapping {
    readonly sheetName: string;

    fromRows(rows: SheetGrid): {value: number[]; issues: ValidationIssue[]};

    toRows(availableBets: number[]): SheetGrid;
}
