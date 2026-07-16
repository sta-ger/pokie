import type {ValidationIssue} from "../validation/ValidationIssue.js";
import type {ExternalArtifactGenerationResult} from "./ExternalArtifactGenerationResult.js";
import type {ExternalDeploymentDeliveryResult} from "./ExternalDeploymentDeliveryResult.js";
import type {ExternalDeploymentDiagnosticReport} from "./ExternalDeploymentDiagnosticReport.js";

// What one ExternalDeploymentService.deploy() call returns — the full record of how far the pipeline
// (descriptor validation -> compatibility -> projection -> generation -> artifact validation -> optional
// diagnostic -> optional delivery) got, and why. Every stage after the first one that reported an error-severity
// issue is simply absent (`undefined`) rather than populated with empty placeholder data, so "did generation
// even run" is always answerable by checking `generation !== undefined`, never by inspecting whether some
// nested array happens to be empty (an empty "artifacts"/"issues" array is itself a perfectly valid, meaningful
// result of a stage that *did* run).
//
// "projectionIssues" covers the stage where ExternalDeploymentService runs every RoundArtifact through
// `target.roundProjector` on the target's own behalf (see that class's own doc comment) — a per-outcome
// projector failure, non-JSON-safe projected output, or a library-hash failure all surface here, before
// "generation" is ever attempted.
export type ExternalDeploymentResult = {
    readonly descriptorIssues: readonly ValidationIssue[];
    readonly compatibilityIssues: readonly ValidationIssue[];
    readonly projectionIssues: readonly ValidationIssue[];
    readonly generation?: ExternalArtifactGenerationResult;
    readonly artifactIssues: readonly ValidationIssue[];
    readonly diagnostic?: ExternalDeploymentDiagnosticReport;
    readonly delivery?: ExternalDeploymentDeliveryResult;
};
