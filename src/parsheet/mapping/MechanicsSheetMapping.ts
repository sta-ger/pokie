import type {GameBlueprintFreeGames} from "../../generated/GameBlueprint.js";
import type {ValidationIssue} from "../../validation/ValidationIssue.js";
import type {SheetGrid} from "../SheetGrid.js";

// Maps the optional "Mechanics" sheet (Scatter Symbol/Matches/Free Games, one row per award tier) to/
// from GameBlueprint's mechanics.freeGames -- the only mechanic GameBlueprintMechanics declares today.
// Whether "scatterSymbol" actually references a listed scatter, or a match-count/award is in range, is
// left to GameBlueprintValidator once the blueprint is assembled; this only reports problems unique to
// the spreadsheet shape: a blank cell, or -- since a single freeGames award has exactly one
// scatterSymbol -- rows that disagree on which scatter symbol they're for, which can't become one
// GameBlueprintFreeGames at all (see "parsheet-mechanics-multiple-scatter-symbols").
export interface MechanicsSheetMapping {
    readonly sheetName: string;

    fromRows(rows: SheetGrid): {value: GameBlueprintFreeGames | undefined; issues: ValidationIssue[]};

    toRows(freeGames: GameBlueprintFreeGames): SheetGrid;
}
