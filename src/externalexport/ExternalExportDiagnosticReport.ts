import type {ExternalExportDiagnosticCheck} from "./ExternalExportDiagnosticCheck.js";

// "ok" is always exactly the AND of every check's own "ok" — never an independent judgment call — so a caller
// can trust it without re-deriving it from "checks" by hand.
export type ExternalExportDiagnosticReport = {
    readonly ok: boolean;
    readonly checks: readonly ExternalExportDiagnosticCheck[];
};
