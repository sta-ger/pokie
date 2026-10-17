import type {StakeEngineExactSource} from "./StakeEngineExactSource.js";
import type {StakeEngineExportOptions} from "./StakeEngineExporting.js";
import type {StakeEngineExportResult} from "./StakeEngineExportResult.js";

/** Bounded exact interchange, separate from numeric Outcome Library export. */
export interface StakeEngineExactSourceExporting {
    exportExactSourceToDirectory(source: StakeEngineExactSource, outDir: string, options?: StakeEngineExportOptions): Promise<StakeEngineExportResult>;
}
