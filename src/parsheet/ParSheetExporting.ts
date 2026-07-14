import type {GameBlueprint} from "../generated/GameBlueprint.js";
import type {ValidationIssue} from "../validation/ValidationIssue.js";

export interface ParSheetExporting {
    // "sourcePath", when given, is recorded on the "Meta" sheet only (see ProvenanceSheetMapping) —
    // it plays no role in the export itself.
    exportToFile(blueprint: GameBlueprint, filePath: string, sourcePath?: string): Promise<ValidationIssue[]>;
}
