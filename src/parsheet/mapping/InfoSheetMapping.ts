import type {GameBlueprintInfo} from "../../generated/GameBlueprint.js";
import type {ValidationIssue} from "../../validation/ValidationIssue.js";
import type {SheetGrid} from "../SheetGrid.js";

export type InfoSheetValue = {
    info: GameBlueprintInfo;
    reels: number;
    rows: number;
};

// Maps the "Info" key/value sheet (Id/Name/Version/Description/Author/Reels/Rows) to/from the
// GameBlueprint fields it covers. "Payline row basis" is an exported, read-only note (the Paylines
// sheet uses 0-based row indexes); it is recognized on import but intentionally not a blueprint field.
// Deliberately does not re-check "id must be non-empty"/"reels must
// be a positive integer" itself — ParSheetImporter runs the assembled blueprint through the existing
// GameBlueprintValidator for that, so this only reports problems unique to the spreadsheet shape
// (an unrecognized or duplicated row key) that the validator has no way to see.
export interface InfoSheetMapping {
    readonly sheetName: string;

    fromRows(rows: SheetGrid): {value: InfoSheetValue; issues: ValidationIssue[]};

    toRows(manifest: GameBlueprintInfo, reels: number, rows: number): SheetGrid;
}
