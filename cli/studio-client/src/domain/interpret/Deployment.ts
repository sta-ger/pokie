import type {
    StudioDeploymentArtifactView,
    StudioDeploymentRunView,
    StudioDeploymentStageSummary,
    StudioDeploymentTargetSummary,
    ValidationIssue,
} from "../../api/types";

// Pure view-model transforms for the Deployment tab — same role as interpretReplay.ts/interpretSimulation.ts:
// main.ts/dom.ts consume these instead of branching on the raw StudioDeploymentRunView shape
// themselves, and (being pure) these are unit-testable without a real DOM/jsdom. Nothing here
// re-derives a stage's own ok/error/skipped status — that's computed once, authoritatively, server-side
// (see computeDeploymentStages) — this only repackages `view.stages` alongside the handful of other
// fields dom.ts's render function needs.

// Same role as Runtime.ts's own RecentSpinsListView — "loading" (set directly by useDeploymentManager's
// refreshTargets(), never constructed here) is what lets the Select-target step tell "the fetch hasn't
// resolved yet" apart from "it resolved and there's genuinely nothing registered", so it never flashes a
// false "No deployment targets registered." before the first request has actually completed.
export type DeploymentTargetsListView = {status: "loading"} | {status: "empty"} | {status: "loaded"; targets: StudioDeploymentTargetSummary[]};

export function describeDeploymentTargetsList(targets: StudioDeploymentTargetSummary[]): DeploymentTargetsListView {
    return targets.length === 0 ? {status: "empty"} : {status: "loaded", targets};
}

// Whether a freshly re-fetched target descriptor is meaningfully different from the one a Refresh's
// caller previously had selected — every field StudioDeploymentTargetSummary actually carries besides
// `id` (which is how `fresh` was looked up in the first place, so it's already known to match).
// Capabilities are compared as a set (sorted) since a reordered-but-otherwise-identical list declares
// the exact same contract, not a changed one. Used by useDeploymentManager's refreshTargets() to decide
// whether a previously run preview/deploy result — computed against the *old* descriptor — must be
// invalidated: a changed minPokieVersion/symbolAlphabet/requiresHomogeneousProvenance/capability set
// means that result no longer reflects what this target actually requires or supports.
export function hasTargetDescriptorChanged(previous: StudioDeploymentTargetSummary, fresh: StudioDeploymentTargetSummary): boolean {
    if (previous.version !== fresh.version) {
        return true;
    }
    const previousCapabilities = [...previous.capabilities].sort();
    const freshCapabilities = [...fresh.capabilities].sort();
    if (previousCapabilities.length !== freshCapabilities.length || previousCapabilities.some((capability, index) => capability !== freshCapabilities[index])) {
        return true;
    }
    return (
        previous.requirements.minPokieVersion !== fresh.requirements.minPokieVersion ||
        previous.requirements.symbolAlphabet !== fresh.requirements.symbolAlphabet ||
        previous.requirements.requiresHomogeneousProvenance !== fresh.requirements.requiresHomogeneousProvenance
    );
}

// Plain-language descriptions for the Select-target step -- capability ids are an intentionally open
// vocabulary (see ExternalDeploymentCapability.ts's own doc comment: a third-party target is free to
// declare its own ids ExternalDeploymentCompatibilityValidator never checks against), so an unrecognized
// one is shown as-is rather than hidden — a target author's own capability id is still useful information
// even when this UI doesn't have a friendlier label for it yet.
const KNOWN_CAPABILITY_DESCRIPTIONS: Record<string, string> = {
    "roundArtifact.featureEvents": "Rounds with feature events (e.g. free spins, bonus triggers)",
    "roundArtifact.debugMetadata": "Rounds carrying debug metadata",
    multiMode: "More than one bet mode in a single deployment",
};

export function describeTargetCapability(capabilityId: string): string {
    return KNOWN_CAPABILITY_DESCRIPTIONS[capabilityId] ?? capabilityId;
}

// Every field of ExternalDeploymentRequirements is optional and permissive-by-default when omitted (see
// that type's own doc comment) -- this only restates whichever fields the target actually declared, in
// the language the Check-compatibility step's own preflight failures refer back to, never inventing a
// constraint the target didn't declare.
export function describeTargetRequirements(requirements: StudioDeploymentTargetSummary["requirements"]): string[] {
    const lines: string[] = [];
    if (requirements.minPokieVersion) {
        lines.push(`Every deployed mode's outcome library must have been built with pokie v${requirements.minPokieVersion} or newer.`);
    }
    if (requirements.symbolAlphabet === "numeric") {
        lines.push("Every symbol must be a numeric id -- string symbols are rejected.");
    }
    if (requirements.requiresHomogeneousProvenance) {
        lines.push("Every mode in one deployment must come from the same game build (id, version, config).");
    }
    if (lines.length === 0) {
        lines.push("No special requirements -- accepts any compatible outcome library.");
    }
    return lines;
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

// Every outcome the Deployment tab's own workflow can end up in, in the language a non-technical user
// would recognize -- never re-validating anything, only reading which stage (if any) computeDeploymentStages
// already marked "error" server-side, plus `publish`/`delivered`. The mapping from stage key to outcome
// kind mirrors what each stage actually represents (see computeDeploymentStages's own doc comment):
//   - "descriptor"/"compatibility" failing means the target itself rejected this content before doing
//     any work -- "incompatible", the Check-compatibility step's own blocked state.
//   - "projection"/"generation"/"artifactValidation" failing means the content (an outcome library, or
//     what the generator produced from it) didn't validate against the target's own shape -- fixable by
//     editing a mode's library path, not by picking a different target -- "validation-failure".
//   - "diagnostic"/"delivery" failing means the target/transport itself couldn't be reached or written to
//     even though the content was valid -- "transport-failure".
//   - No stage failed and this was a preview (publish: false): "partial" -- the content is valid and
//     ready, but nothing has actually been published yet.
//   - No stage failed and this was a real deploy (publish: true): "success".
export type DeploymentOutcomeKind = "success" | "partial" | "incompatible" | "validation-failure" | "transport-failure";

const INCOMPATIBLE_STAGE_KEYS: readonly StudioDeploymentStageSummary["key"][] = ["descriptor", "compatibility"];
const VALIDATION_FAILURE_STAGE_KEYS: readonly StudioDeploymentStageSummary["key"][] = ["projection", "generation", "artifactValidation"];
const TRANSPORT_FAILURE_STAGE_KEYS: readonly StudioDeploymentStageSummary["key"][] = ["diagnostic", "delivery"];

export function describeDeploymentOutcome(view: DeploymentRunResultView): DeploymentOutcomeKind {
    const errorStage = view.stages.find((stage) => stage.status === "error");
    if (errorStage !== undefined) {
        if ((INCOMPATIBLE_STAGE_KEYS as string[]).includes(errorStage.key)) {
            return "incompatible";
        }
        if ((VALIDATION_FAILURE_STAGE_KEYS as string[]).includes(errorStage.key)) {
            return "validation-failure";
        }
        return "transport-failure";
    }
    return view.publish ? "success" : "partial";
}

// Every issue belonging to one named group of stages (e.g. the Check-compatibility step's own
// "descriptor"+"compatibility" pair) -- `stages` is always the server-computed, authoritative list, this
// only groups/flattens it, never re-derives a stage's own status.
export function collectStageIssues(stages: readonly StudioDeploymentStageSummary[], keys: readonly StudioDeploymentStageSummary["key"][]): ValidationIssue[] {
    return stages.filter((stage) => (keys as string[]).includes(stage.key)).flatMap((stage) => stage.issues);
}

export const COMPATIBILITY_STAGE_KEYS = INCOMPATIBLE_STAGE_KEYS;
export const PREVIEW_STAGE_KEYS = VALIDATION_FAILURE_STAGE_KEYS;
export const TRANSPORT_STAGE_KEYS = TRANSPORT_FAILURE_STAGE_KEYS;

// Shared by every panel that shows a stage's issues as separate "Errors"/"Warnings" lists (matching the
// Validate tab's own summary.errors/summary.warnings split) -- "info"-severity issues are folded into
// warnings since neither of the two IssueList panels here reserves a third slot for them.
export function splitIssuesBySeverity(issues: readonly ValidationIssue[]): {errors: ValidationIssue[]; warnings: ValidationIssue[]} {
    return {
        errors: issues.filter((issue) => issue.severity === "error"),
        warnings: issues.filter((issue) => issue.severity !== "error"),
    };
}
