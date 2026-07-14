import type {GameBlueprint} from "../../generated/GameBlueprint.js";
import type {ValidationIssue} from "../../validation/ValidationIssue.js";
import type {SheetGrid} from "../SheetGrid.js";
import type {ParSheetProvenance} from "./ParSheetProvenance.js";

// Maps the optional "Meta" sheet (schema version, pokie version, export timestamp, source blueprint
// path, and a canonical sha256 hash of the exported blueprint — see computeBlueprintHash.ts) to/from
// provenance metadata. Unlike every other mapper, its output never becomes part of the imported
// GameBlueprint; fromRows() is a pure parse with no ValidationIssue of its own — judging whether the
// result is complete/well-formed/hash-matching is ParSheetImporter's job (see its
// verifyProvenance()), since that needs the fully assembled blueprint to compare against.
export interface ProvenanceSheetMapping {
    readonly sheetName: string;

    fromRows(rows: SheetGrid): {value: ParSheetProvenance; issues: ValidationIssue[]};

    toRows(blueprint: GameBlueprint, pokieVersion: string, exportedAt: Date, sourcePath: string | undefined): SheetGrid;
}
