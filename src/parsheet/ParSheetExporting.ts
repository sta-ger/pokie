import type {ValidationIssue} from "../validation/ValidationIssue.js";

export interface ParSheetExporting {
    // "blueprint" is `unknown`, not `GameBlueprint` — exportToFile runs full validation itself (the
    // same GameBlueprintValidator "pokie build"/ParSheetImporter use) rather than trusting the caller
    // to have already checked it, so it's just as safe to call directly as it is via the CLI. See its
    // own doc comment for the exact preflight order and the "no partial write" guarantee.
    //
    // "sourcePath", when given, is recorded on the "Meta" sheet only (see ProvenanceSheetMapping) —
    // it plays no role in the export itself.
    exportToFile(blueprint: unknown, filePath: string, sourcePath?: string): Promise<ValidationIssue[]>;
}
