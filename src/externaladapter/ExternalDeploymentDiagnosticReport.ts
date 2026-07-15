import type {ExternalDeploymentDiagnosticCheck} from "./ExternalDeploymentDiagnosticCheck.js";

// "ok" is always exactly the AND of every check's own "ok" — never an independent judgment call — so a caller
// can trust it without re-deriving it from "checks" by hand.
export type ExternalDeploymentDiagnosticReport = {
    readonly ok: boolean;
    readonly checks: readonly ExternalDeploymentDiagnosticCheck[];
};
