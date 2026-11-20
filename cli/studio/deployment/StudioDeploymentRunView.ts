import type {FormatConversionPlan, ExternalExportDeliveryResult, ExternalExportDiagnosticReport, ValidationIssue} from "@fromstan/pokie";
import type {StudioDeploymentFileView} from "./StudioDeploymentFileView.js";
import type {StudioDeploymentStageSummary} from "./StudioDeploymentStageSummary.js";

// POST /api/project/deployment/runs' own DTO — a JSON-safe, one-to-one mirror of ExternalExportResult
// (see that type's own doc comment in the pokie package for what each field means), with two transforms
// applied: every generated file's own `content` is always a plain string here (see
// StudioDeploymentFileView), and `stages` is the authoritative, server-computed per-stage status
// (see computeDeploymentStages) — a client renders `stages` directly and never re-derives a stage's own
// ok/error/skipped status from which of the other fields below happen to be present.
export type StudioDeploymentRunView = {
    /** The server-selected outcome-library prerequisite for this deployment. */
    readonly plan: FormatConversionPlan;
    readonly targetId: string;
    // Whether this run's target had its runtimeConnector attached (a real "Deploy") or stripped (a
    // side-effect-free "Preview") — see StudioDeploymentService.run()'s own doc comment. Never itself
    // an indicator of whether delivery actually happened; check `delivery?.delivered` for that.
    readonly publish: boolean;
    readonly stages: readonly StudioDeploymentStageSummary[];
    readonly descriptorIssues: readonly ValidationIssue[];
    readonly compatibilityIssues: readonly ValidationIssue[];
    readonly projectionIssues: readonly ValidationIssue[];
    readonly generation?: {
        readonly files: readonly StudioDeploymentFileView[];
        readonly issues: readonly ValidationIssue[];
    };
    readonly fileIssues: readonly ValidationIssue[];
    readonly diagnostic?: ExternalExportDiagnosticReport;
    readonly delivery?: ExternalExportDeliveryResult;
};
