import type {ValidationIssue} from "../validation/ValidationIssue.js";
import type {StakeEngineImportResult} from "./StakeEngineImportResult.js";

export interface StakeEngineImportWriting<T extends string | number = string> {
    writeToDirectory(importResult: StakeEngineImportResult<T>, outDir: string): Promise<{issues: readonly ValidationIssue[]}>;
}
