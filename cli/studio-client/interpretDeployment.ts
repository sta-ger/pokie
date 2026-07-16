import type {StudioDeploymentArtifactView, StudioDeploymentRunView, StudioDeploymentStageSummary, StudioDeploymentTargetSummary} from "./types.js";

// Pure view-model transforms for the Deployment tab — same role as interpretReplay.ts/interpretSimulation.ts:
// main.ts/dom.ts consume these instead of branching on the raw StudioDeploymentRunView shape
// themselves, and (being pure) these are unit-testable without a real DOM/jsdom. Nothing here
// re-derives a stage's own ok/error/skipped status — that's computed once, authoritatively, server-side
// (see computeDeploymentStages) — this only repackages `view.stages` alongside the handful of other
// fields dom.ts's render function needs.

export type DeploymentTargetsListView = {status: "empty"} | {status: "loaded"; targets: StudioDeploymentTargetSummary[]};

export function describeDeploymentTargetsList(targets: StudioDeploymentTargetSummary[]): DeploymentTargetsListView {
    return targets.length === 0 ? {status: "empty"} : {status: "loaded", targets};
}

export type DeploymentRunResultView = {
    readonly stages: readonly StudioDeploymentStageSummary[];
    readonly artifacts: readonly StudioDeploymentArtifactView[];
    // True only once every stage that ran reported no error — mirrors what the "Deploy"/"Preview"
    // button's own success feedback should say, without dom.ts having to re-derive it from `stages`.
    readonly ok: boolean;
    readonly publish: boolean;
    readonly delivered?: boolean;
};

export function describeDeploymentRunResult(view: StudioDeploymentRunView): DeploymentRunResultView {
    return {
        stages: view.stages,
        artifacts: view.generation?.artifacts ?? [],
        ok: view.stages.every((stage) => stage.status !== "error"),
        publish: view.publish,
        delivered: view.delivery?.delivered,
    };
}
