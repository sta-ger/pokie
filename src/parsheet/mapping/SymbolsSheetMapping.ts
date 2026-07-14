import type {ValidationIssue} from "../../validation/ValidationIssue.js";
import type {SheetGrid} from "../SheetGrid.js";

export type SymbolsSheetValue = {
    symbols: string[];
    wilds: string[];
    scatters: string[];
};

// Maps the "Symbols" sheet (Symbol/Wild/Scatter columns, one row per symbol in reel order) to/from
// GameBlueprint's symbols/wilds/scatters. Duplicate symbol ids and wild+scatter overlap are left to
// GameBlueprintValidator (blueprint-symbols-duplicate/blueprint-wilds-scatters-overlap) once the
// arrays are assembled — this only reports a row whose Symbol cell is blank (which would otherwise
// silently vanish) or a Wild/Scatter cell that isn't a recognizable boolean.
export interface SymbolsSheetMapping {
    readonly sheetName: string;

    fromRows(rows: SheetGrid): {value: SymbolsSheetValue; issues: ValidationIssue[]};

    toRows(value: SymbolsSheetValue): SheetGrid;
}
