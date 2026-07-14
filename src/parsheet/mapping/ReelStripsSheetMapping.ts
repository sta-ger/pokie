import type {ValidationIssue} from "../../validation/ValidationIssue.js";
import type {SheetGrid} from "../SheetGrid.js";

// Maps the "ReelStrips" sheet (one "Reel N" column per reel, one row per strip position, ragged
// reels leaving trailing blank cells) to/from GameBlueprint's literal reelStrips. "reels" (from
// Manifest.Reels) is the expected column count — see resolveReelColumns for how a missing (including
// trailing), duplicate, or out-of-range "Reel <k>" column is reported. Whether a strip references an
// unknown/duplicate symbol is left to GameBlueprintValidator once reelStrips is assembled; this only
// additionally reports a blank cell followed by a non-blank one further down the same column (a
// "gap"), which the flat reelStrips array on its own can't distinguish from an intentionally shorter
// (ragged) reel.
export interface ReelStripsSheetMapping {
    readonly sheetName: string;

    fromRows(rows: SheetGrid, reels: number): {value: string[][]; issues: ValidationIssue[]};

    toRows(reelStrips: string[][]): SheetGrid;
}
