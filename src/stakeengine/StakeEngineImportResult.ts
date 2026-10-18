import type {ValidationIssue} from "../validation/ValidationIssue.js";
import type {StakeEngineExportModeInput} from "./StakeEngineExportModeInput.js";
import type {StakeEngineImportSourceProvenance} from "./StakeEngineImportSourceProvenance.js";
import type {StakeEngineManifest} from "./StakeEngineManifest.js";

// A successful import supplies native numeric modes or an exactSource payload when weights exceed
// native library limits. On errors both are absent/empty and manifest/provenance are undefined.
// Retaining the original Stake payload provides exact interchange without changing native sampling.
export type StakeEngineImportResult<T extends string | number = string> = {
    /** Exact validated payload for weights outside native library limits. No numeric rescaling. */
    readonly exactSource?: import("./StakeEngineExactSource.js").StakeEngineExactSource;
    readonly stakeDir: string;
    readonly manifest: StakeEngineManifest | undefined;
    readonly modes: readonly StakeEngineExportModeInput<T>[];
    readonly sourceProvenance: StakeEngineImportSourceProvenance | undefined;
    readonly issues: readonly ValidationIssue[];
};
