import type {ExternalExportModeInput} from "./ExternalExportModeInput.js";
import type {ExternalExportResult} from "./ExternalExportResult.js";
import type {ExternalExportTarget} from "./ExternalExportTarget.js";

export interface ExternalExportServicing<T extends string | number = string> {
    deploy(target: ExternalExportTarget<T>, modes: readonly ExternalExportModeInput<T>[]): Promise<ExternalExportResult>;
}
