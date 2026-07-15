import type {StakeEngineBundleModeInput} from "./StakeEngineBundleModeInput.js";
import type {StakeEngineExportResult} from "./StakeEngineExportResult.js";

export interface StakeEngineBundleStreamingExporting {
    exportToDirectory(modes: readonly StakeEngineBundleModeInput[], outDir: string): Promise<StakeEngineExportResult>;
}
