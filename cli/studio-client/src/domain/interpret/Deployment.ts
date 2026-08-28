import type {
    OutcomeLibrarySelector,
    StudioDeploymentArtifactView,
    StudioDeploymentModeInput,
    StudioDeploymentRunView,
    StudioDeploymentStageSummary,
    StudioDeploymentTargetSummary,
    StudioOutcomeLibraryRegistryView,
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

// The External Adapter SDK's own ready-to-run example target's id -- shared by the Select-target step
// (which explains, in plain language, that this specific target only ever writes local JSON artifacts
// and never publishes anything externally) and ExportDeployTargets.ts's own card classification.
// Defined here (not in ExportDeployTargets.ts) since that module already imports from this one -- this
// avoids a cycle.
export const LOCAL_JSON_EXAMPLE_TARGET_ID = "local-json-example";

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
// Mirrors ExternalDeploymentCapability.ts's own MULTI_MODE_DEPLOYMENT_CAPABILITY id -- a target that
// doesn't declare this only ever accepts exactly one mode per deployment (see
// ExternalDeploymentCompatibilityValidator's own enforcement of that), which is what gates whether the
// Configure step's own "Add mode" action is ever offered.
export const MULTI_MODE_CAPABILITY_ID = "multiMode";

const KNOWN_CAPABILITY_DESCRIPTIONS: Record<string, string> = {
    "roundArtifact.featureEvents": "Rounds with feature events (e.g. free spins, bonus triggers)",
    "roundArtifact.debugMetadata": "Rounds carrying debug metadata",
    [MULTI_MODE_CAPABILITY_ID]: "More than one bet mode in a single deployment",
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

// ---- Configure step: mode mapping ----
// The Configure step maps each deployed mode to the built game's own bet modes (never a hand-typed
// string -- until the build's own modes are known, mode-name entry stays blocked entirely, see
// describeBuildModesUnavailable) and, per row, to a compatible outcome library discovered from the
// Outcome Libraries registry (never an empty free-text path) -- these functions are the pure decision
// logic behind that mapping, unit-testable without a real Select/PathInput/registry fetch.

function trimmedModeName(row: StudioDeploymentModeInput): string {
    return row.modeName.trim();
}

// Every mode name already claimed by some *other* row -- mirrors CertificationTab's own usedModeNames,
// the shared "forbid duplicates" primitive both tabs build their own remaining-choices/blocker logic on.
export function usedDeploymentModeNames(rows: readonly StudioDeploymentModeInput[], excludeIndex: number): Set<string> {
    return new Set(rows.filter((_row, index) => index !== excludeIndex).map(trimmedModeName).filter((name) => name.length > 0));
}

// Build modes still available to the row at `index` -- every one of the project's own build modes not
// already claimed by some *other* row, plus this row's own current selection (so choosing it never makes
// it vanish from its own dropdown). `undefined` `buildModeIds` means the project's own build modes aren't
// known yet (still loading, or this project wasn't built from a tracked source blueprint at all -- see
// CertificationTab's own ProjectModesView) -- callers must treat that as "nothing pickable yet" (see
// describeBuildModesUnavailable below), never fall back to an unrestricted mode-name input: a deployment
// mode must always come from the current build, never a hand-typed string that might not even exist in it.
export function remainingDeploymentModeChoices(
    buildModeIds: readonly string[] | undefined,
    rows: readonly StudioDeploymentModeInput[],
    index: number,
): readonly string[] | undefined {
    if (buildModeIds === undefined) {
        return undefined;
    }
    const used = usedDeploymentModeNames(rows, index);
    const ownValue = rows[index] !== undefined ? trimmedModeName(rows[index]) : "";
    return buildModeIds.filter((id) => id === ownValue || !used.has(id));
}

// Whether "Add mode" should ever be offered -- gated on three independent things: the project's own build
// modes actually being known (an unknown `buildModeIds`, see remainingDeploymentModeChoices's own doc
// comment, means there is nothing real to pick for a new row, so adding one is blocked outright rather
// than falling back to a hand-typed mode name), the selected target's own declared multiMode capability (a
// target that omits it only ever accepts exactly one mode per deployment, see
// ExternalDeploymentCompatibilityValidator), and whether any build mode remains unclaimed by an existing
// row.
export function canAddDeploymentMode(
    buildModeIds: readonly string[] | undefined,
    rows: readonly StudioDeploymentModeInput[],
    targetSupportsMultiMode: boolean,
): boolean {
    if (buildModeIds === undefined) {
        return false;
    }
    if (rows.length >= 1 && !targetSupportsMultiMode) {
        return false;
    }
    const used = usedDeploymentModeNames(rows, -1);
    return buildModeIds.some((id) => !used.has(id));
}

// The Configure step's own domain-language remediation for "the project's build modes aren't available
// yet" -- an unknown `buildModeIds` (see remainingDeploymentModeChoices's own doc comment) means there is
// no real bet mode to pick from, so this replaces the old free-text fallback: every mode-name control
// stays disabled and "Add mode" stays blocked (see canAddDeploymentMode) until the build's own modes
// resolve. `undefined` once they have -- nothing to block on this account.
export function describeBuildModesUnavailable(buildModeIds: readonly string[] | undefined): string | undefined {
    if (buildModeIds !== undefined) {
        return undefined;
    }
    return "This project's build modes aren't available yet -- deployment modes can only come from the current build, never a hand-typed name. Build this project from a tracked source blueprint, then reopen this tab to pick modes here.";
}

export function isBlankLibrarySelector(selector: OutcomeLibrarySelector): boolean {
    if (selector.kind === "json") {
        return selector.path.trim().length === 0;
    }
    if (selector.kind === "bundle") {
        return selector.bundleDir.trim().length === 0 || selector.modeName.trim().length === 0;
    }
    return selector.stakeDir.trim().length === 0 || selector.modeName.trim().length === 0;
}

// Whether a row's own librarySelector is safe to silently replace when its modeName changes -- a blank
// selector obviously is, and so is a "bundle" one (its own `modeName` field must always match the row's,
// see discoverDeploymentModeLibrarySelector's own doc comment, so it's already tied to the mode it was
// discovered for). A manually-chosen "json"/"stakeengine" selector is never auto-replaced this way -- see
// useDeploymentManager's own setModeName, which is the only caller of this.
export function isAutoDiscoverableLibrarySelector(selector: OutcomeLibrarySelector): boolean {
    return selector.kind === "bundle" || isBlankLibrarySelector(selector);
}

// The Outcome Libraries registry's own compatibility classification for exactly the bundle a row's own
// librarySelector points at -- `undefined` when the registry has nothing to say about it (no registry
// data yet, no bundle for this mode, or the row's own selector isn't a bundle selector at all, e.g. a
// hand-chosen flat JSON file the registry never indexed).
function registryBuildStatusForSelector(
    modeName: string,
    selector: OutcomeLibrarySelector,
    registry: StudioOutcomeLibraryRegistryView,
): "compatible" | "stale" | "wrong" | undefined {
    if (registry.status !== "ok" || registry.buildStatus === "missing" || selector.kind !== "bundle") {
        return undefined;
    }
    return registry.modes.find((mode) => mode.modeName === modeName && mode.bundleDir === selector.bundleDir)?.buildStatus;
}

// The latest registry-known library compatible with the current build for a given mode name, ready to
// drop straight into a row's own librarySelector -- `undefined` when the registry has no (or no longer
// compatible) entry for this mode, at which point the Configure step falls back to offering
// Choose/Generate/open the hub instead of silently leaving the row on a stale selector.
export function discoverDeploymentModeLibrarySelector(modeName: string, registry: StudioOutcomeLibraryRegistryView): OutcomeLibrarySelector | undefined {
    if (registry.status !== "ok" || registry.buildStatus === "missing") {
        return undefined;
    }
    const entry = registry.modes.find((mode) => mode.modeName === modeName && mode.buildStatus === "compatible");
    return entry === undefined ? undefined : {kind: "bundle", bundleDir: entry.bundleDir, modeName: entry.modeName};
}

// Every status a Configure row's own mode-name+library pairing can be in, in the language the row's own
// status badge shows:
//   - "unselected": no mode picked yet (a freshly added row).
//   - "duplicate": this row's mode name is already claimed by another row -- forbidden outright, never
//     silently deployed twice (see usedDeploymentModeNames -- structurally shouldn't happen through the
//     Select-based mode picker alone, but is still checked here as the one place duplicate-ness is
//     actually decided, in case a row's own selection is ever set another way).
//   - "missing": a mode is picked but no library has been chosen/discovered for it yet.
//   - "wrongBuild": the chosen library is a registry-known bundle that's stale or from a different game
//     build -- present, but not safe to deploy as-is.
//   - "invalid": the last Check/Deploy run's own load-error named this exact mode (see
//     StudioDeploymentService.run()'s own "mode "<name>": <reason>" prefix) -- the chosen selector doesn't
//     actually resolve to a readable, well-formed library.
//   - "ready": everything about this row is deployable as far as the Configure step can tell locally; the
//     Check-compatibility step is still the authoritative last word.
export type DeploymentModeRowStatus = "unselected" | "duplicate" | "missing" | "wrongBuild" | "invalid" | "ready";

export function classifyDeploymentModeRow(
    row: StudioDeploymentModeInput,
    index: number,
    rows: readonly StudioDeploymentModeInput[],
    registry: StudioOutcomeLibraryRegistryView,
    lastRunError?: string,
): DeploymentModeRowStatus {
    const modeName = trimmedModeName(row);
    if (modeName.length === 0) {
        return "unselected";
    }
    if (usedDeploymentModeNames(rows, index).has(modeName)) {
        return "duplicate";
    }
    if (isBlankLibrarySelector(row.librarySelector)) {
        return "missing";
    }
    if (lastRunError !== undefined && lastRunError.includes(`mode "${modeName}"`)) {
        return "invalid";
    }
    const registryStatus = registryBuildStatusForSelector(modeName, row.librarySelector, registry);
    if (registryStatus === "wrong" || registryStatus === "stale") {
        return "wrongBuild";
    }
    return "ready";
}

const DEPLOYMENT_MODE_ROW_STATUS_DESCRIPTIONS: Record<DeploymentModeRowStatus, {label: string; color: string}> = {
    unselected: {label: "Pick a mode", color: "gray"},
    ready: {label: "Ready", color: "green"},
    missing: {label: "Missing library", color: "red"},
    wrongBuild: {label: "Wrong build", color: "yellow"},
    invalid: {label: "Invalid", color: "red"},
    duplicate: {label: "Duplicate mode", color: "red"},
};

export function describeDeploymentModeRowStatus(status: DeploymentModeRowStatus): {label: string; color: string} {
    return DEPLOYMENT_MODE_ROW_STATUS_DESCRIPTIONS[status];
}

// Plain-language reasons the Configure step's own deployment preflight is blocked -- computed
// entirely client-side from already-known row statuses, never a raw schema/validation path (see
// validateDeploymentRunRequest's own request-shape errors, which are a distinct, request-level concern
// this never surfaces directly to the user).
export function computeDeploymentConfigureBlockers(rows: readonly StudioDeploymentModeInput[], statuses: readonly DeploymentModeRowStatus[]): string[] {
    const blockers: string[] = [];
    statuses.forEach((status, index) => {
        const modeLabel = trimmedModeName(rows[index]) || `Row ${index + 1}`;
        if (status === "unselected") {
            blockers.push(`${modeLabel}: pick a bet mode.`);
        } else if (status === "missing") {
            blockers.push(`${modeLabel}: choose, generate, or pick a compatible outcome library from the hub.`);
        } else if (status === "wrongBuild") {
            blockers.push(`${modeLabel}: the selected library is from a different or older build -- regenerate it or pick another.`);
        } else if (status === "duplicate") {
            blockers.push(`${modeLabel}: this mode is already used by another row -- remove one.`);
        } else if (status === "invalid") {
            blockers.push(`${modeLabel}: the selected library couldn't be read as a valid outcome library.`);
        }
    });
    return blockers;
}

// The Preview-artifacts step's own plain-language account of what a deployment preflight run actually
// touched -- shown alongside the artifact list regardless of outcome, since even a validation/transport
// failure still generated *something* worth explaining the provenance of. Distinguishes the four things
// an external deployment conceptually is: this mode's own outcome library (input, read-only), the
// target's own adapter (the thing that transforms that library into its own artifact shape -- never this
// UI's own code), the artifacts that transformation produced (output, listed separately), and where a
// real Deploy would eventually send them (the destination). Destination detail is only ever as exact as
// the preflight contract actually supplies: the SDK's own local-json-example target (see
// LOCAL_JSON_EXAMPLE_TARGET_ID) writes to a known, project-relative local path via
// atomicallyWriteExternalDeploymentArtifactsToDirectory's own documented temp-directory/atomic-swap/
// best-effort-cleanup contract, so that exact destination and lifecycle is rendered here rather than
// asserted away as opaque; any other, third-party target's own runtimeAdapter genuinely isn't
// introspectable client-side (see StudioDeploymentTargetSummary's own doc comment), so this says so
// honestly instead of inventing a location or a temp-file story the target may not even have. Either way,
// a deployment preflight (publish: false) never calls that destination's own runtimeAdapter at all (see
// StudioDeploymentService.run()'s own doc comment) -- nothing is written, locally or remotely, so this
// never claims a mutation that didn't happen.
export function describeDeploymentPreflightArtifactNote(target: StudioDeploymentTargetSummary): string {
    const inputAdapterOutput =
        `Input: this mode's own outcome library, read only -- never modified by this pipeline, and neither is the ` +
        `project's own built package/blueprint it was checked against.\n\n` +
        `Adapter: "${target.id}"'s own generator transforms that library into the artifacts listed below (output).`;

    const destination =
        target.id === LOCAL_JSON_EXAMPLE_TARGET_ID
            ? `Destination: a real Deploy writes these exact artifacts to this project's own deployment/${target.id} ` +
              `folder on local disk -- nothing is published externally. That folder is only ever replaced ` +
              `atomically: every artifact is first written into a fresh temporary folder beside it, and only ` +
              `swapped into place, in one atomic step, once every file has been written successfully. If anything ` +
              `fails before that swap, the temporary folder is deleted and deployment/${target.id} is left exactly ` +
              `as it was -- never a partial result. After a successful swap, the folder it replaced is removed as ` +
              `a best-effort cleanup step; a failure to remove it is only ever a warning, never a failed deploy, ` +
              `and the leftover folder's own path is reported so it can be removed by hand.`
            : `Destination: a real Deploy sends these exact artifacts to "${target.id}"'s own registered ` +
              `destination. This UI can't confirm whether that's a local path, a remote endpoint, or a registry, ` +
              `or whether it uses a temporary file along the way -- a third-party target's own runtimeAdapter is ` +
              `never introspectable client-side, only its declared id/requirements/capabilities are.`;

    const nonMutation =
        `Nothing here is written anywhere yet: this deployment preflight never reaches that destination at all -- ` +
        `these artifacts exist only in this response, and neither the local project nor "${target.id}" itself has ` +
        `been touched. Run Deploy separately to actually publish them.`;

    return `${inputAdapterOutput}\n\n${destination}\n\n${nonMutation}`;
}

export type DeploymentRunResultView = {
    /** Server-selected prerequisite; this interpreter never derives one. */
    readonly plan?: StudioDeploymentRunView["plan"];
    readonly error?: string;
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
        ...(view.plan === undefined ? {} : {plan: view.plan}),
        ...(view.error === undefined ? {} : {error: view.error}),
        stages: view.stages,
        artifacts: view.generation?.artifacts ?? [],
        ok: view.status !== "unavailable" && view.status !== "conflict" && view.stages.every((stage) => stage.status !== "error"),
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
