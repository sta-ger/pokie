import type {GameBlueprintFreeGames, GameBlueprintMechanics} from "../../generated/GameBlueprint.js";
import type {ValidationIssue} from "../../validation/ValidationIssue.js";
import type {SheetGrid} from "../SheetGrid.js";

// Maps legacy scatter-award rows or extended Mechanic/Configuration JSON rows.
// The assembled Blueprint receives the same semantic validator as CLI and Studio.
export interface MechanicsSheetMapping {
    readonly sheetName: string;

    fromRows(rows: SheetGrid): {value: GameBlueprintFreeGames | undefined; mechanics?: GameBlueprintMechanics; issues: ValidationIssue[]};

    toRows(freeGames: GameBlueprintFreeGames | undefined, mechanics?: GameBlueprintMechanics): SheetGrid;
}
