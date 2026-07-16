import type {ExternalDeploymentDeliveryResult, ExternalDeploymentDiagnosticReport, ValidationIssue} from "pokie";
import type {StudioDeploymentArtifactView} from "./StudioDeploymentArtifactView.js";
import type {StudioDeploymentStageSummary} from "./StudioDeploymentStageSummary.js";

// POST /api/project/deployment/runs' own DTO — a JSON-safe, one-to-one mirror of ExternalDeploymentResult
// (see that type's own doc comment in the pokie package for what each field means), with two transforms
// applied: every generated artifact's own `content` is always a plain string here (see
// StudioDeploymentArtifactView), and `stages` is the authoritative, server-computed per-stage status
// (see computeDeploymentStages) — a client renders `stages` directly and never re-derives a stage's own
// ok/error/skipped status from which of the other fields below happen to be present.
export type StudioDeploymentRunView = {
    readonly targetId: string;
    // Whether this run's target had its runtimeAdapter attached (a real "Deploy") or stripped (a
    // side-effect-free "Preview") — see StudioDeploymentService.run()'s own doc comment. Never itself
    // an indicator of whether delivery actually happened; check `delivery?.delivered` for that.
    readonly publish: boolean;
    readonly stages: readonly StudioDeploymentStageSummary[];
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
