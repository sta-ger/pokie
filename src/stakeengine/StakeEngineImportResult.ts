import type {ValidationIssue} from "../validation/ValidationIssue.js";
import type {StakeEngineExportModeInput} from "./StakeEngineExportModeInput.js";
import type {StakeEngineManifest} from "./StakeEngineManifest.js";

// The result of StakeEngineImporter.importFromDirectory. "modes" is [] and "manifest" is undefined if and only if
// "issues" contains an error — mirroring StakeEngineExportResult's own all-or-nothing contract. Deliberately
// reuses StakeEngineExportModeInput<T> (the exporter's own input type) rather than a near-duplicate — that's
// what makes "import, then re-export result.modes" a one-line round trip, both in tests and from the CLI.
export type StakeEngineImportResult<T extends string | number = string> = {
    readonly stakeDir: string;
    readonly manifest: StakeEngineManifest | undefined;
    readonly modes: readonly StakeEngineExportModeInput<T>[];
    readonly issues: readonly ValidationIssue[];
};
