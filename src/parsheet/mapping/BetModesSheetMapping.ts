import type {BetMode} from "../../gamepackage/BetMode.js";
import type {ValidationIssue} from "../../validation/ValidationIssue.js";
import type {SheetGrid} from "../SheetGrid.js";

// Maps the optional "BetModes" sheet (Id/Label/Cost Multiplier/Target RTP/Runtime Type/Is Default/
// Forced Free Games, one row per selectable bet mode) to/from GameBlueprint's betModes -- including the explicit,
// opt-in runtime-semantics fields (see gamepackage/BetMode.ts's own doc comment), so a PAR sheet
// round-trip never silently drops them back to metadata-only. Whether the whole array is a
// consistent, complete runtime-semantics specification (exactly one default, ante/buyFeature's own
// required fields, etc.) is left to GameBlueprintValidator once the array is assembled (mirrors
// AvailableBetsSheetMapper not re-checking duplicate bets itself) -- this only reports a blank "Id"
// cell, or a cell that's present but not parseable as its own column's basic type (number/boolean/one
// of the three known Runtime Type strings).
export interface BetModesSheetMapping {
    readonly sheetName: string;

    fromRows(rows: SheetGrid): {value: BetMode[]; issues: ValidationIssue[]};

    toRows(betModes: BetMode[]): SheetGrid;
}
