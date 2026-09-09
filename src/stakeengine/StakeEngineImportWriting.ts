import type {ValidationIssue} from "../validation/ValidationIssue.js";
import type {StakeEngineImportResult} from "./StakeEngineImportResult.js";

export type StakeEngineImportWriteOptions = {
    readonly signal?: AbortSignal;
    readonly assertDestinationAvailable?: () => Promise<void> | void;
};

export interface StakeEngineImportWriting<T extends string | number = string> {
    writeToDirectory(
        importResult: StakeEngineImportResult<T>,
        outDir: string,
        options?: StakeEngineImportWriteOptions,
    ): Promise<{issues: readonly ValidationIssue[]}>;
}
