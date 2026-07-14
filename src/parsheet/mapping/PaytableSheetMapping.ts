import type {GameBlueprint} from "../../generated/GameBlueprint.js";
import type {ValidationIssue} from "../../validation/ValidationIssue.js";
import type {SheetGrid} from "../SheetGrid.js";

// Not named "Paytable" — that name is already exported by session/videoslot/paytable/Paytable.ts (the
// runtime paytable lookup class), an unrelated type from the barrel's point of view.
export type ParSheetPaytable = GameBlueprint["paytable"];

// Maps the "Paytable" sheet (Symbol/Matches/Multiplier, one row per payout tier) to/from
// GameBlueprint's paytable. Whether a match count/multiplier is in range is left to
// GameBlueprintValidator once the paytable object is assembled — this only reports a blank Symbol
// cell, a Matches/Multiplier cell that isn't a number at all, or two rows for the same
// (Symbol, Matches) pair, since building a plain object from spreadsheet rows silently keeps only
// the last one and the validator has no way to know a row was ever dropped.
export interface PaytableSheetMapping {
    readonly sheetName: string;

    fromRows(rows: SheetGrid): {value: ParSheetPaytable; issues: ValidationIssue[]};

    toRows(paytable: ParSheetPaytable): SheetGrid;
}
