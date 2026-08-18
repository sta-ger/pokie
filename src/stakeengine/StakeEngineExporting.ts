import type {StakeEngineExportModeInput} from "./StakeEngineExportModeInput.js";
import type {StakeEngineExportResult} from "./StakeEngineExportResult.js";

// Export lifecycle belongs to the public exporter contract so a direct caller and an ArtifactBuilder see the
// same cooperative cancellation points while books and files are actually being produced.
export type StakeEngineExportProgress = {
    readonly completed: bigint;
    readonly message: string;
};

export type StakeEngineExportOptions = {
    readonly signal?: AbortSignal;
    readonly onProgress?: (progress: StakeEngineExportProgress) => void;
};

export class StakeEngineExportCancelledError extends Error {
    constructor() {
        super("Stake Engine export was cancelled.");
        this.name = "StakeEngineExportCancelledError";
    }
}

export interface StakeEngineExporting<T extends string | number = string> {
    exportToDirectory(
        modes: readonly StakeEngineExportModeInput<T>[],
        outDir: string,
        options?: StakeEngineExportOptions,
    ): Promise<StakeEngineExportResult>;
}
