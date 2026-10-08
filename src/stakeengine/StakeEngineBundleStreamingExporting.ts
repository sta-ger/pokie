import type {StakeEngineBundleModeInput} from "./StakeEngineBundleModeInput.js";
import type {StakeEngineExportOptions} from "./StakeEngineExporting.js";
import type {StakeEngineExportResult} from "./StakeEngineExportResult.js";

export interface StakeEngineBundleStreamingExporting {
    exportToDirectory(modes: readonly StakeEngineBundleModeInput[], outDir: string, options?: StakeEngineExportOptions): Promise<StakeEngineExportResult>;
}
