import type {ValidationIssue} from "pokie";
import type {StudioDeploymentStageStatus} from "./StudioDeploymentStageStatus.js";

export type StudioDeploymentStageKey =
    | "descriptor"
    | "compatibility"
    | "projection"
    | "generation"
    | "artifactValidation"
    | "diagnostic"
    | "delivery";

// One row of StudioDeploymentRunView.stages — computed once, server-side, by computeDeploymentStages
// (see that function's own doc comment). "issues" is always the exact ValidationIssue[] that explains
// `status`, whatever ExternalDeploymentService field it actually came from — a client renders this
// directly and never has to know which underlying field a given stage's diagnostics live in.
export type StudioDeploymentStageSummary = {
    readonly key: StudioDeploymentStageKey;
    readonly label: string;
    readonly status: StudioDeploymentStageStatus;
    readonly issues: readonly ValidationIssue[];
};
