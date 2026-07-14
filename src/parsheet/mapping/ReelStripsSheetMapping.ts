import type {ValidationIssue} from "../../validation/ValidationIssue.js";
import type {SheetGrid} from "../SheetGrid.js";

// Maps the "ReelStrips" sheet (one "Reel N" column per reel, one row per strip position, ragged
// reels leaving trailing blank cells) to/from GameBlueprint's literal reelStrips. Whether the number
// of columns matches "reels", or a strip references an unknown/duplicate symbol, is left to
// GameBlueprintValidator once reelStrips is assembled — this only reports a blank cell followed by a
// non-blank one further down the same column (a "gap"), which the flat reelStrips array on its own
// can't distinguish from an intentionally shorter (ragged) reel.
export interface ReelStripsSheetMapping {
    readonly sheetName: string;

    fromRows(rows: SheetGrid): {value: string[][]; issues: ValidationIssue[]};

    toRows(reelStrips: string[][]): SheetGrid;
}
