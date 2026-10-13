import type {GameBlueprint} from "../../generated/GameBlueprint.js";
import type {ValidationIssue} from "../../validation/ValidationIssue.js";
import type {SheetGrid} from "../SheetGrid.js";

export interface ReelSequencesSheetMapping {
    readonly sheetName: string;
    toRows(reels: NonNullable<GameBlueprint["reelSequences"]>): SheetGrid;
    fromRows(
        rows: SheetGrid,
        reels: number,
    ): {value: NonNullable<GameBlueprint["reelSequences"]>; issues: ValidationIssue[]};
}
