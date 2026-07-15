import type {ExternalDeploymentDiagnosticReport} from "./ExternalDeploymentDiagnosticReport.js";

// An optional self-check a target may implement to report on its own current readiness — e.g. "is the
// configured output directory writable", "is the remote endpoint reachable" — independent of any particular
// content being deployed (contrast with ExternalDeploymentCompatibilityValidator, which checks a specific
// deployment's content against a target's requirements/capabilities, not the target's own operational state).
// Always a Promise, even for a target whose own checks are synchronous (wrap in Promise.resolve(...)) — a
// remote/network-backed target's diagnostic is inherently asynchronous, and callers need one uniform contract
// regardless of which kind of target they're talking to. Never throws — a check that fails to even run is
// reported as a failing ExternalDeploymentDiagnosticCheck, not a rejected promise.
export interface ExternalDeploymentDiagnostic {
    diagnose(): Promise<ExternalDeploymentDiagnosticReport>;
}
