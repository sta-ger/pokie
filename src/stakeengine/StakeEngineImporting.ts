import type {StakeEngineImportResult} from "./StakeEngineImportResult.js";

export interface StakeEngineImporting<T extends string | number = string> {
    importFromDirectory(stakeDir: string): Promise<StakeEngineImportResult<T>>;
}
