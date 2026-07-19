import type {GameBlueprintWinModel} from "../../generated/GameBlueprint.js";
import type {ValidationIssue} from "../../validation/ValidationIssue.js";
import type {SheetGrid} from "../SheetGrid.js";

// Maps the optional "WinModel" sheet (Key/Value: "Type" -- one of lines/ways/clusters -- plus
// "Minimum Cluster Size", relevant only for "clusters") to/from GameBlueprint's winModel. Whether
// minimumClusterSize is >= 2, or "type" conflicts with a present "paylines" sheet, is left to
// GameBlueprintValidator once the blueprint is assembled -- this only reports problems unique to the
// spreadsheet shape (a missing/unrecognized "Type" value, which can't become any GameBlueprintWinModel
// at all).
export interface WinModelSheetMapping {
    readonly sheetName: string;

    fromRows(rows: SheetGrid): {value: GameBlueprintWinModel | undefined; issues: ValidationIssue[]};

    toRows(winModel: GameBlueprintWinModel): SheetGrid;
}
