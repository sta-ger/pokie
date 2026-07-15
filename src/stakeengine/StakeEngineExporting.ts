import type {StakeEngineExportModeInput} from "./StakeEngineExportModeInput.js";
import type {StakeEngineExportResult} from "./StakeEngineExportResult.js";

export interface StakeEngineExporting<T extends string | number = string> {
    exportToDirectory(modes: readonly StakeEngineExportModeInput<T>[], outDir: string): Promise<StakeEngineExportResult>;
}
