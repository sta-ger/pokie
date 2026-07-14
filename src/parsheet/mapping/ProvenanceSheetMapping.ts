import type {GameBlueprint} from "../../generated/GameBlueprint.js";
import type {ValidationIssue} from "../../validation/ValidationIssue.js";
import type {SheetGrid} from "../SheetGrid.js";
import type {ParSheetProvenance} from "./ParSheetProvenance.js";

// Maps the optional "Meta" sheet (schema version, pokie version, export timestamp, source blueprint
// path, and a sha256 hash of the exported blueprint — the same hashing formula GameBuildInfo uses)
// to/from provenance metadata. Unlike every other mapper, its output never becomes part of the
// imported GameBlueprint — it only ever surfaces as an informational ValidationIssue.
export interface ProvenanceSheetMapping {
    readonly sheetName: string;

    fromRows(rows: SheetGrid): {value: ParSheetProvenance; issues: ValidationIssue[]};

    toRows(blueprint: GameBlueprint, pokieVersion: string, exportedAt: Date, sourcePath: string | undefined): SheetGrid;
}
