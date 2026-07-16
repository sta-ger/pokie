import type {ExternalDeploymentDeliveryResult, ExternalDeploymentDiagnosticReport, ValidationIssue} from "pokie";
import type {StudioDeploymentArtifactView} from "./StudioDeploymentArtifactView.js";

// POST /api/project/deployment/runs' own DTO — a JSON-safe, one-to-one mirror of ExternalDeploymentResult
// (see that type's own doc comment in the pokie package for what each stage/field means), with only
// one actual transform applied: every generated artifact's own `content` is always a plain string
// here (see StudioDeploymentArtifactView). Every stage's field is `undefined` exactly when
// ExternalDeploymentService itself never ran that stage — the Deployment tab renders each stage's own
// block only when its data is present, so "diagnostics by stage" falls directly out of this shape
// rather than being re-derived on the client.
export type StudioDeploymentRunView = {
    readonly targetId: string;
    // Whether this run's target had its runtimeAdapter attached (a real "Deploy") or stripped (a
    // side-effect-free "Preview") — see StudioDeploymentService.run()'s own doc comment. Never itself
    // an indicator of whether delivery actually happened; check `delivery?.delivered` for that.
    readonly publish: boolean;
    readonly descriptorIssues: readonly ValidationIssue[];
    readonly compatibilityIssues: readonly ValidationIssue[];
    readonly projectionIssues: readonly ValidationIssue[];
    readonly generation?: {
        readonly artifacts: readonly StudioDeploymentArtifactView[];
        readonly issues: readonly ValidationIssue[];
    };
    readonly artifactIssues: readonly ValidationIssue[];
    readonly diagnostic?: ExternalDeploymentDiagnosticReport;
    readonly delivery?: ExternalDeploymentDeliveryResult;
};
