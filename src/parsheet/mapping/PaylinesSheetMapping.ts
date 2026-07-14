import type {ValidationIssue} from "../../validation/ValidationIssue.js";
import type {SheetGrid} from "../SheetGrid.js";

// Maps the "Paylines" sheet ("Line" — a 1-based label, not read back — followed by one "Reel N"
// column per reel) to/from GameBlueprint's paylines. "reels" (from Manifest.Reels) is the expected
// column count — see resolveReelColumns for how a missing (including trailing), duplicate, or
// out-of-range "Reel <k>" column is reported. Whether a row index is in range, or a payline
// duplicates another one, is left to GameBlueprintValidator once paylines is assembled; this only
// additionally reports a reel cell that isn't a whole number at all, which the validator has no way
// to represent (there'd be nothing to put in the array).
export interface PaylinesSheetMapping {
    readonly sheetName: string;

    fromRows(rows: SheetGrid, reels: number): {value: number[][]; issues: ValidationIssue[]};

    toRows(paylines: number[][]): SheetGrid;
}
