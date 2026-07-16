import type {StudioDeploymentArtifactView, StudioDeploymentRunView, StudioDeploymentTargetSummary, ValidationIssue} from "./types.js";

// Pure view-model transforms for the Deployment tab — same role as interpretReplay.ts/interpretSimulation.ts:
// main.ts/dom.ts consume these instead of branching on the raw StudioDeploymentRunView shape
// themselves, and (being pure) these are unit-testable without a real DOM/jsdom. Nothing here
// re-runs, re-checks, or second-guesses anything ExternalDeploymentService already computed — every
// transform below only ever reads fields already present on the DTO the server sent.

export type DeploymentTargetsListView = {status: "empty"} | {status: "loaded"; targets: StudioDeploymentTargetSummary[]};

export function describeDeploymentTargetsList(targets: StudioDeploymentTargetSummary[]): DeploymentTargetsListView {
    return targets.length === 0 ? {status: "empty"} : {status: "loaded", targets};
}

function hasError(issues: readonly ValidationIssue[]): boolean {
    return issues.some((issue) => issue.severity === "error");
}

export type DeploymentStageStatus = "ok" | "error" | "skipped";

function stageStatus(skippedBecauseEarlierStageFailed: boolean, thisStageFailed: boolean): DeploymentStageStatus {
    if (skippedBecauseEarlierStageFailed) {
        return "skipped";
    }
    return thisStageFailed ? "error" : "ok";
}

export type DeploymentStageSummary = {
    readonly key: string;
    readonly label: string;
    readonly status: DeploymentStageStatus;
    readonly issues: readonly ValidationIssue[];
};

export type DeploymentRunResultView = {
    readonly stages: readonly DeploymentStageSummary[];
    readonly artifacts: readonly StudioDeploymentArtifactView[];
    // True only once every stage that ran reported no error — mirrors what the "Deploy"/"Preview"
    // button's own success feedback should say, without dom.ts having to re-derive it from `stages`.
    readonly ok: boolean;
    readonly publish: boolean;
    readonly delivered?: boolean;
};

// Turns the server's own stage-by-stage ExternalDeploymentResult mirror into a uniform list a single
// render function can walk — a stage is "skipped" exactly when ExternalDeploymentService itself never
// ran it (an earlier stage already failed), never inferred any other way.
export function describeDeploymentRunResult(view: StudioDeploymentRunView): DeploymentRunResultView {
    const descriptorFailed = hasError(view.descriptorIssues);
    const compatibilityFailed = hasError(view.compatibilityIssues);
    const projectionFailed = hasError(view.projectionIssues);
    const generationFailed = view.generation === undefined || hasError(view.generation.issues);
    const artifactValidationFailed = hasError(view.artifactIssues);

    const upToCompatibilityFailed = descriptorFailed || compatibilityFailed;
    const upToProjectionFailed = upToCompatibilityFailed || projectionFailed;
    const upToGenerationFailed = upToProjectionFailed || generationFailed;
    const upToArtifactsFailed = upToGenerationFailed || artifactValidationFailed;

    const stages: DeploymentStageSummary[] = [
        {key: "descriptor", label: "Target descriptor", status: stageStatus(false, descriptorFailed), issues: view.descriptorIssues},
        {key: "compatibility", label: "Compatibility", status: stageStatus(descriptorFailed, compatibilityFailed), issues: view.compatibilityIssues},
        {key: "projection", label: "Round projection", status: stageStatus(upToCompatibilityFailed, projectionFailed), issues: view.projectionIssues},
        {
            key: "generation",
            label: "Artifact generation",
            status: stageStatus(upToProjectionFailed, generationFailed),
            issues: view.generation?.issues ?? [],
        },
        {
            key: "artifactValidation",
            label: "Artifact validation",
            status: stageStatus(upToGenerationFailed, artifactValidationFailed),
            issues: view.artifactIssues,
        },
    ];

    const diagnosticFailed = view.diagnostic !== undefined && !view.diagnostic.ok;
    const diagnosticSkipped = upToArtifactsFailed || view.diagnostic === undefined;
    stages.push({
        key: "diagnostic",
        label: "Target diagnostic",
        status: stageStatus(diagnosticSkipped, diagnosticFailed),
        issues: (view.diagnostic?.checks ?? [])
            .filter((check) => !check.ok)
            .map((check) => ({code: check.name, severity: "error" as const, message: check.message ?? `"${check.name}" failed.`})),
    });

    const deliverySkipped = !view.publish || upToArtifactsFailed || diagnosticFailed;
    const deliveryFailed = view.delivery === undefined || !view.delivery.delivered;
    stages.push({
        key: "delivery",
        label: "Delivery",
        status: stageStatus(deliverySkipped, deliveryFailed),
        issues: view.delivery?.issues ?? [],
    });

    return {
        stages,
        artifacts: view.generation?.artifacts ?? [],
        ok: stages.every((stage) => stage.status !== "error"),
        publish: view.publish,
        delivered: view.delivery?.delivered,
    };
}
