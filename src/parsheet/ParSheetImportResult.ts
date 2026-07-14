import type {GameBlueprint} from "../generated/GameBlueprint.js";
import type {ValidationIssue} from "../validation/ValidationIssue.js";

export type ParSheetImportResult = {
    blueprint: GameBlueprint;
    // Both "parsheet-*" diagnostics (unknown sheets/columns, cells that can't be parsed at all — see
    // the mapping/* interfaces) and "blueprint-*" diagnostics from running the assembled blueprint
    // through the existing GameBlueprintValidator (reachability, paytable quality, ...), merged into
    // one list — split by severity the same way BuildCommand/ValidateCommand already do.
    issues: ValidationIssue[];
};
