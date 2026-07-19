import type {BetMode} from "../../gamepackage/BetMode.js";
import type {ValidationIssue} from "../../validation/ValidationIssue.js";
import type {SheetGrid} from "../SheetGrid.js";

// Maps the optional "BetModes" sheet (Id/Label/Cost Multiplier, one row per selectable bet mode) to/
// from GameBlueprint's betModes. Whether an id is duplicated is left to GameBlueprintValidator once
// the array is assembled (mirrors AvailableBetsSheetMapper not re-checking duplicate bets itself) --
// this only reports a blank "Id" cell, or a "Cost Multiplier" cell that's present but not a number.
export interface BetModesSheetMapping {
    readonly sheetName: string;

    fromRows(rows: SheetGrid): {value: BetMode[]; issues: ValidationIssue[]};

    toRows(betModes: BetMode[]): SheetGrid;
}
