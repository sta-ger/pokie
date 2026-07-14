import type {GameBlueprint} from "../generated/GameBlueprint.js";
import type {ValidationIssue} from "../validation/ValidationIssue.js";
import type {ParSheetProvenance} from "./mapping/ParSheetProvenance.js";

export type ParSheetImportResult = {
    blueprint: GameBlueprint;
    // Parsed from the "Meta" sheet (see ProvenanceSheetMapping) — undefined only when the workbook
    // has no "Meta" sheet at all. Present-but-incomplete/invalid provenance is still returned here
    // as-is (whatever was actually parsed); see the "issues" field for whether it's trustworthy.
    provenance: ParSheetProvenance | undefined;
    // Both "parsheet-*" diagnostics (unknown sheets/columns, cells that can't be parsed at all — see
    // the mapping/* interfaces) and "blueprint-*" diagnostics from running the assembled blueprint
    // through the existing GameBlueprintValidator (reachability, paytable quality, ...), merged into
    // one list — split by severity the same way BuildCommand/ValidateCommand already do.
    issues: ValidationIssue[];
};
