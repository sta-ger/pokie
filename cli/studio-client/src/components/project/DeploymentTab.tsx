import {Alert, Anchor, Badge, Button, Card, Group, List, Radio, Select, Stepper, Text} from "@mantine/core";
import {IconAlertTriangle, IconCircleCheck} from "@tabler/icons-react";
import {useEffect, useRef, useState, type ReactNode} from "react";
import type {OutcomeLibrarySelector, StudioDeploymentModeInput, StudioDeploymentStageSummary, StudioDeploymentTargetSummary, StudioOutcomeLibraryRegistryView} from "../../api/types";
import {
    canAddDeploymentMode,
    classifyDeploymentModeRow,
    collectStageIssues,
    COMPATIBILITY_STAGE_KEYS,
    computeDeploymentConfigureBlockers,
    describeBuildModesUnavailable,
    describeDeploymentModeRowStatus,
    describeDeploymentOutcome,
    describeTargetCapability,
    describeTargetRequirements,
    LOCAL_JSON_EXAMPLE_TARGET_ID,
    MULTI_MODE_CAPABILITY_ID,
    PREVIEW_STAGE_KEYS,
    remainingDeploymentModeChoices,
    splitIssuesBySeverity,
    TRANSPORT_STAGE_KEYS,
    type DeploymentOutcomeKind,
    type DeploymentRunResultView,
    type DeploymentTargetsListView,
} from "../../domain/interpret/Deployment";
import {describePathActionError} from "../../domain/pathActionError";
import type {DeploymentProjectModesView} from "../../hooks/useDeploymentManager";
import {useConfirm} from "../../hooks/useConfirm";
import {AdvancedDisclosure} from "../common/AdvancedDisclosure";
import {CodeBlock} from "../common/CodeBlock";
import {EmptyState} from "../common/EmptyState";
import {ErrorState} from "../common/ErrorState";
import {IssueList} from "../common/IssueList";
import {LoadingState} from "../common/LoadingState";
import {OutcomeBanner} from "../common/OutcomeBanner";
import {PageSection} from "../common/PageSection";
import {PathInput} from "../common/PathInput";
import {QuickActions} from "../common/QuickActions";
import {RowActions} from "../common/RowActions";

const OUTCOME_BANNER: Record<DeploymentOutcomeKind, {color: string; icon: ReactNode; title: string}> = {
    success: {color: "green", icon: <IconCircleCheck size={16} />, title: "Deployed successfully"},
    partial: {color: "blue", icon: <IconCircleCheck size={16} />, title: "Preview succeeded -- ready to deploy"},
    incompatible: {color: "red", icon: <IconAlertTriangle size={16} />, title: "Incompatible with this target"},
    "validation-failure": {color: "orange", icon: <IconAlertTriangle size={16} />, title: "Content didn't validate for this target"},
    "transport-failure": {color: "red", icon: <IconAlertTriangle size={16} />, title: "Target couldn't be reached or written to"},
};

// Requirements/capabilities detail shared by every place a target's own contract is shown -- the
// multi-target picker's own comparison cards and the single-selected summary alike. The
// local-json-example callout is deliberately explicit about "local JSON, nothing published externally"
// -- unlike a real remote target, its own destination could otherwise read as ambiguous about whether
// anything leaves this machine.
function TargetDetail({target}: {target: StudioDeploymentTargetSummary}) {
    return (
        <div>
            <Text fw={600}>
                {target.id} (v{target.version})
            </Text>
            {target.id === LOCAL_JSON_EXAMPLE_TARGET_ID && (
                <Text size="sm" c="dimmed" mt={4}>
                    Writes local JSON artifacts under this project&apos;s own deployment/{target.id} folder --
                    nothing is published externally.
                </Text>
            )}
            <Text size="sm" fw={600} mt={4}>
                Requirements
            </Text>
            <List size="sm" withPadding>
                {describeTargetRequirements(target.requirements).map((line, index) => (
                    <List.Item key={index}>{line}</List.Item>
                ))}
            </List>
            {target.capabilities.length > 0 && (
                <>
                    <Text size="sm" fw={600} mt={4}>
                        Supports
                    </Text>
                    <List size="sm" withPadding>
                        {target.capabilities.map((capability) => (
                            <List.Item key={capability}>{describeTargetCapability(capability)}</List.Item>
                        ))}
                    </List>
                </>
            )}
        </div>
    );
}

// The Select-target step's own empty-registry state -- unlike a bare "nothing here" message, this gives
// an actual way forward: register a real target, install the SDK's own ready-to-run example, or fall
// back to the sibling static-export pipeline that needs no registration at all.
function EmptyTargetRegistry({onOpenStakeEngineExport}: {onOpenStakeEngineExport: () => void}) {
    return (
        <div>
            <EmptyState message="No deployment targets registered." />
            <Text size="sm" c="dimmed" mt="sm" mb="sm">
                Register an ExternalDeploymentTarget for this project (see docs/external-adapter-sdk.md) to
                deploy to a real target -- the SDK ships a ready-to-run local-json-example target you can
                install to try the pipeline end to end. Until one is registered, Stake Engine Export can still
                produce a static bundle without any target registration.
            </Text>
            <QuickActions>
                <Button variant="default" size="xs" onClick={onOpenStakeEngineExport}>
                    Open Stake Engine Export instead
                </Button>
            </QuickActions>
        </div>
    );
}

// The picker shown whenever there is more than one registered target to choose between (or, as a
// defensive fallback, whenever nothing is selected yet at all) -- a single Radio.Group of comparison
// cards plus one explicit "Continue with target" action, rather than a per-card "Select" button, so
// picking is a deliberate two-step "compare, then commit" instead of the first click already advancing.
function TargetPicker({
    targets,
    initialTargetId,
    onContinue,
}: {
    targets: readonly StudioDeploymentTargetSummary[];
    initialTargetId: string | undefined;
    onContinue: (target: StudioDeploymentTargetSummary) => void;
}) {
    const [pickedId, setPickedId] = useState(initialTargetId);
    const picked = targets.find((target) => target.id === pickedId);
    return (
        <div>
            <Radio.Group value={pickedId ?? ""} onChange={setPickedId} label="Choose a deployment target">
                {targets.map((target) => (
                    <Card
                        key={target.id}
                        withBorder
                        mt="xs"
                        padding="sm"
                        style={target.id === pickedId ? {borderColor: "var(--mantine-color-blue-6)", borderWidth: 2} : undefined}
                    >
                        <Radio value={target.id} label={<TargetDetail target={target} />} />
                    </Card>
                ))}
            </Radio.Group>
            <QuickActions>
                <Button disabled={picked === undefined} onClick={() => picked !== undefined && onContinue(picked)}>
                    Continue with target
                </Button>
            </QuickActions>
        </div>
    );
}

// The compact view shown once a target is already selected -- "Change target" only appears when there is
// something to change to, so a lone registered target (the common case) never dangles a button back to a
// list with nothing else in it.
function SelectedTargetSummary({
    target,
    hasAlternatives,
    onChangeTarget,
}: {
    target: StudioDeploymentTargetSummary;
    hasAlternatives: boolean;
    onChangeTarget: () => void;
}) {
    return (
        <div>
            <Group justify="space-between" mb="sm">
                <Text size="sm" c="dimmed">
                    {hasAlternatives ? "Selected target" : "Automatically selected -- the only target registered"}
                </Text>
                {hasAlternatives && (
                    <Button size="xs" variant="default" onClick={onChangeTarget}>
                        Change target
                    </Button>
                )}
            </Group>
            <TargetDetail target={target} />
        </div>
    );
}

// The Select-target step's own root -- a lone compatible target is already selected by the time this
// renders (see useDeploymentManager's own refreshTargets()), so there is never an artificial step forcing
// a click through a single option: the compact summary shows right away, with no Change-target button
// since there is nothing to change to. Multiple targets fall back to TargetPicker's own compare-then-
// commit flow; picking a different one from there re-collapses back to the summary (see the `browsing`
// reset below, keyed off `selectedTarget`'s own identity).
function SelectTargetStep({
    view,
    selectedTarget,
    onSelectTarget,
    onOpenStakeEngineExport,
}: {
    view: DeploymentTargetsListView;
    selectedTarget: StudioDeploymentTargetSummary | undefined;
    onSelectTarget: (target: StudioDeploymentTargetSummary) => void;
    onOpenStakeEngineExport: () => void;
}) {
    const [browsing, setBrowsing] = useState(false);
    useEffect(() => {
        setBrowsing(false);
    }, [selectedTarget]);

    if (view.status === "loading") {
        return <LoadingState label="Loading deployment targets…" />;
    }
    if (view.status === "empty") {
        return <EmptyTargetRegistry onOpenStakeEngineExport={onOpenStakeEngineExport} />;
    }

    const hasAlternatives = view.targets.length > 1;
    if (selectedTarget !== undefined && !browsing) {
        return <SelectedTargetSummary target={selectedTarget} hasAlternatives={hasAlternatives} onChangeTarget={() => setBrowsing(true)} />;
    }
    return <TargetPicker targets={view.targets} initialTargetId={selectedTarget?.id} onContinue={onSelectTarget} />;
}

// A row's own outcome-library field -- a registry-discovered bundle is shown read-only (with a way back
// to a hand-chosen file), everything else is the same PathInput every other flat-JSON-library field in
// this app already uses.
function DeploymentModeLibraryField({
    selector,
    projectRoot,
    onChange,
}: {
    selector: OutcomeLibrarySelector;
    projectRoot: string | undefined;
    onChange: (selector: OutcomeLibrarySelector) => void;
}) {
    if (selector.kind === "bundle") {
        return (
            <div>
                <Text size="sm" fw={600}>
                    Outcome library
                </Text>
                <Text size="sm" style={{overflowWrap: "anywhere"}}>
                    Discovered: <code>{selector.bundleDir}</code> (mode &quot;{selector.modeName}&quot;)
                </Text>
                <Anchor component="button" type="button" size="xs" onClick={() => onChange({kind: "json", path: ""})}>
                    Choose a different file instead
                </Anchor>
            </div>
        );
    }
    return (
        <PathInput
            label="Outcome library path"
            kind="file"
            browseTitle="Browse for an outcome library"
            browseId="deployment-outcome-library-path"
            fileFilters={[{name: "JSON files", extensions: ["json"]}]}
            relevantDirectory={projectRoot}
            value={selector.kind === "json" ? selector.path : ""}
            onChange={(event) => onChange({kind: "json", path: event.currentTarget.value})}
            onPathSelected={(path) => onChange({kind: "json", path})}
        />
    );
}

// One Configure-step mode row -- mode name is always picked from the project's own build modes (a Select
// restricted to remainingDeploymentModeChoices, never a hand-typed string); until those are known (see
// DeploymentProjectModesView's own doc comment), the control stays disabled rather than accepting free
// text -- the Configure step's own buildModesUnavailableMessage explains why. The library field discovers
// a compatible outcome library automatically (see
// useDeploymentManager's own setModeName) and otherwise offers Choose (the PathInput above) or a way to
// the Outcome Libraries tab's own Generate/Registry hub. The status badge is the exact same
// classifyDeploymentModeRow the Configure-step blockers list below is built from -- never a second,
// diverging notion of "is this row OK".
function DeploymentModeRow({
    mode,
    index,
    modes,
    projectModesView,
    registryView,
    lastRunError,
    projectRoot,
    canRemove,
    onModeNameChange,
    onLibrarySelectorChange,
    onRemove,
    onOpenOutcomeLibraries,
}: {
    mode: StudioDeploymentModeInput;
    index: number;
    modes: readonly StudioDeploymentModeInput[];
    projectModesView: DeploymentProjectModesView;
    registryView: StudioOutcomeLibraryRegistryView | undefined;
    lastRunError: string | undefined;
    projectRoot: string | undefined;
    canRemove: boolean;
    onModeNameChange: (modeName: string) => void;
    onLibrarySelectorChange: (selector: OutcomeLibrarySelector) => void;
    onRemove: () => void;
    onOpenOutcomeLibraries: () => void;
}) {
    const status = classifyDeploymentModeRow(mode, index, modes, registryView ?? {status: "load-error", error: ""}, lastRunError);
    const statusInfo = describeDeploymentModeRowStatus(status);
    const buildModeIds = projectModesView.status === "ok" ? projectModesView.modeIds : undefined;
    const remaining = remainingDeploymentModeChoices(buildModeIds, modes, index);

    return (
        <Card withBorder padding="sm" mb="sm">
            <Group justify="space-between" mb="xs">
                <Badge color={statusInfo.color}>{statusInfo.label}</Badge>
                {canRemove && <RowActions itemLabel={`mode ${index + 1}`} onRemove={onRemove} />}
            </Group>
            <Group gap="sm" wrap="wrap" align="flex-start">
                <div>
                    {remaining !== undefined ? (
                        <Select
                            label="Mode name"
                            placeholder="Choose a mode…"
                            data={remaining as string[]}
                            value={mode.modeName.trim().length > 0 ? mode.modeName : null}
                            onChange={(value) => onModeNameChange(value ?? "")}
                        />
                    ) : (
                        <Select label="Mode name" placeholder="Build modes unavailable" data={[]} value={null} disabled />
                    )}
                </div>
                <div style={{flex: 1, minWidth: 260}}>
                    <DeploymentModeLibraryField selector={mode.librarySelector} projectRoot={projectRoot} onChange={onLibrarySelectorChange} />
                </div>
            </Group>
            {(status === "missing" || status === "wrongBuild") && (
                <QuickActions>
                    <Button variant="default" size="xs" onClick={onOpenOutcomeLibraries}>
                        Generate or pick from the Outcome Libraries hub
                    </Button>
                </QuickActions>
            )}
        </Card>
    );
}

// Which stage-key group a run outcome's own issues live in -- used by the Review-result step, which
// (unlike Check-compatibility/Preview-artifacts) doesn't already know from its own position in the
// workflow which group is relevant, since a real deploy can fail at any stage.
function stageKeysForOutcome(outcome: DeploymentOutcomeKind): readonly StudioDeploymentStageSummary["key"][] {
    if (outcome === "incompatible") {
        return COMPATIBILITY_STAGE_KEYS;
    }
    if (outcome === "validation-failure") {
        return PREVIEW_STAGE_KEYS;
    }
    return TRANSPORT_STAGE_KEYS;
}

// One reusable banner for every step that shows a run outcome -- Check-compatibility, Preview artifacts,
// and Review result all classify the exact same server-computed `runResult.stages` through
// describeDeploymentOutcome and just show a different slice of `issues` (see each call site's own choice
// of stage-key group), never re-deriving pass/fail themselves. Just supplies this tab's own outcome-kind
// map to the shared common/OutcomeBanner renderer.
function DeploymentOutcomeBanner({outcome, issues}: {outcome: DeploymentOutcomeKind; issues: ReturnType<typeof collectStageIssues>}) {
    const {errors, warnings} = splitIssuesBySeverity(issues);
    const banner = OUTCOME_BANNER[outcome];
    return <OutcomeBanner color={banner.color} icon={banner.icon} title={banner.title} errors={errors} warnings={warnings} />;
}

// Humanizes the raw stage-status/issue-severity enum strings for AdvancedRunDetails -- same "translate
// technical fields into readable copy" treatment as describeTargetCapability/describeTargetRequirements
// give the target metadata above.
const STAGE_STATUS_LABEL: Record<string, string> = {ok: "OK", skipped: "Skipped", error: "Error"};
function describeStageStatus(status: string): string {
    return STAGE_STATUS_LABEL[status] ?? status;
}
const ISSUE_SEVERITY_LABEL: Record<string, string> = {error: "Error", warning: "Warning"};
function describeIssueSeverity(severity: string): string {
    return ISSUE_SEVERITY_LABEL[severity] ?? severity;
}

// Raw stage-by-stage status plus (when there is one) the currently-selected artifact's full content --
// tucked under "Advanced details" on both the Preview-artifacts and Review-result steps, same "technical
// detail hidden by default" convention as RoundArtifactInspector/RuntimeTab's own Advanced sections.
function AdvancedRunDetails({
    runResult,
    selectedArtifact,
}: {
    runResult: DeploymentRunResultView;
    selectedArtifact: {relativePath: string; content: string} | undefined;
}) {
    return (
        <AdvancedDisclosure detail="raw artifacts, full pipeline diagnostics">
            <List size="sm">
                {runResult.stages.map((stage) => (
                    <List.Item key={stage.key}>
                        {stage.label}: {describeStageStatus(stage.status)}
                        {stage.issues.length > 0 && (
                            <List size="sm" withPadding>
                                {stage.issues.map((issue, index) => (
                                    <List.Item key={index}>
                                        {describeIssueSeverity(issue.severity)}: {issue.message}
                                    </List.Item>
                                ))}
                            </List>
                        )}
                    </List.Item>
                ))}
            </List>
            {selectedArtifact && (
                <div>
                    <Text fw={600} size="sm" mt="sm" style={{overflowWrap: "anywhere"}}>
                        {selectedArtifact.relativePath}
                    </Text>
                    <CodeBlock>{selectedArtifact.content}</CodeBlock>
                </div>
            )}
            <Text size="sm" fw={600} mt="sm" mb={4}>
                Full run result
            </Text>
            <CodeBlock>{JSON.stringify(runResult, null, 2)}</CodeBlock>
        </AdvancedDisclosure>
    );
}

export function DeploymentTab({
    targetsView,
    targetsError,
    onRefreshTargets,
    selectedTarget,
    onSelectTarget,
    modes,
    projectModesView,
    registryView,
    onSetModeName,
    onSetModeLibrarySelector,
    onAddMode,
    onRemoveMode,
    onPreview,
    onDeploy,
    runResult,
    runError,
    runLoading,
    selectedArtifactPath,
    onSelectArtifact,
    projectRoot,
    onOpenStakeEngineExport,
    onOpenOutcomeLibraries,
}: {
    targetsView: DeploymentTargetsListView;
    targetsError: string | undefined;
    onRefreshTargets: () => void;
    selectedTarget: StudioDeploymentTargetSummary | undefined;
    onSelectTarget: (target: StudioDeploymentTargetSummary) => void;
    modes: StudioDeploymentModeInput[];
    projectModesView: DeploymentProjectModesView;
    registryView: StudioOutcomeLibraryRegistryView | undefined;
    onSetModeName: (index: number, modeName: string) => void;
    onSetModeLibrarySelector: (index: number, selector: OutcomeLibrarySelector) => void;
    onAddMode: () => void;
    onRemoveMode: (index: number) => void;
    onPreview: () => void;
    onDeploy: () => void;
    runResult: DeploymentRunResultView | undefined;
    runError: string | undefined;
    runLoading: boolean;
    selectedArtifactPath: string | undefined;
    onSelectArtifact: (path: string) => void;
    projectRoot?: string;
    onOpenStakeEngineExport: () => void;
    onOpenOutcomeLibraries: () => void;
}) {
    const confirm = useConfirm();
    // Starts on Configure, not Select-target, when a target is already selected the moment this mounts --
    // covers useDeploymentManager's own auto-selection of a lone registered target, which (living in the
    // page-level hook, not this component) typically resolves before this tab is ever opened, so there is
    // no post-mount undefined -> defined transition for the effect below to observe. A slower fetch that
    // resolves *while* this is already mounted is still covered by that effect.
    const [activeStep, setActiveStep] = useState(() => (selectedTarget === undefined ? 0 : 1));
    const selectedArtifact = runResult?.artifacts.find((artifact) => artifact.relativePath === selectedArtifactPath);
    const outcome = runResult ? describeDeploymentOutcome(runResult) : undefined;

    // Which step a settled preview/deploy response should land on -- armed right before firing either
    // request, consumed once that request actually produces a *non-stale* runResult (see the effect
    // below, which fires on `runResult` itself, not on `runLoading` settling -- a stale response never
    // touches `runResult`, so a discarded one can never yank the stepper to a step showing content that
    // was never actually rendered). Mirrors RuntimeTab's own pendingAdvanceStepRef.
    const pendingAdvanceStepRef = useRef<number | undefined>(undefined);
    const prevRunResultRef = useRef(runResult);
    useEffect(() => {
        if (runResult !== undefined && runResult !== prevRunResultRef.current && pendingAdvanceStepRef.current !== undefined) {
            setActiveStep(pendingAdvanceStepRef.current);
            pendingAdvanceStepRef.current = undefined;
        }
        prevRunResultRef.current = runResult;
    }, [runResult]);

    // A target/config change (or a project switch) invalidates whatever was previously run -- runResult
    // goes from defined back to undefined (see useDeploymentManager's own invalidate()/resetForProjectSwitch()).
    // Whenever that happens while sitting past Configure, there is nothing left to show on the later
    // steps, so this falls back to Configure rather than leaving a stale-looking, now-disabled step active.
    const prevRunResultDefinedRef = useRef(runResult !== undefined);
    useEffect(() => {
        const wasDefined = prevRunResultDefinedRef.current;
        const nowDefined = runResult !== undefined;
        if (wasDefined && !nowDefined) {
            setActiveStep((step) => (step > 1 ? 1 : step));
        }
        prevRunResultDefinedRef.current = nowDefined;
    }, [runResult]);

    // A project switch (or the targets list losing the previously-selected target on refresh) clears
    // selectedTarget entirely -- Select-target is the only step that still makes sense at that point.
    useEffect(() => {
        if (selectedTarget === undefined) {
            setActiveStep(0);
        }
    }, [selectedTarget]);

    // Covers useDeploymentManager's own auto-selection of a lone registered target (see its
    // refreshTargets()) -- the moment a target becomes selected out from under Select-target with no
    // TargetPicker interaction at all (the undefined -> defined transition, tracked via the ref below
    // rather than `selectedTarget` reference equality), this advances straight to Configure so a single
    // compatible target never needs an artificial click through Select-target first. A user's own pick
    // (TargetPicker's Continue-with-target button, including re-picking via Change target) advances the
    // step itself via handleSelectTarget below -- that path already has a previously-defined selectedTarget,
    // so it would never trip this transition-only check. A later Refresh merely rebinding the same
    // selection to a fresh object (see refreshTargets()'s own rebind branch) is defined -> defined, so it
    // never trips this either.
    const prevSelectedTargetDefinedRef = useRef(selectedTarget !== undefined);
    useEffect(() => {
        const wasDefined = prevSelectedTargetDefinedRef.current;
        const nowDefined = selectedTarget !== undefined;
        if (!wasDefined && nowDefined && activeStep === 0) {
            setActiveStep(1);
        }
        prevSelectedTargetDefinedRef.current = nowDefined;
    }, [selectedTarget, activeStep]);

    function handleSelectTarget(target: StudioDeploymentTargetSummary): void {
        onSelectTarget(target);
        setActiveStep(1);
    }

    function handleCheckAndPreview(): void {
        pendingAdvanceStepRef.current = 2;
        onPreview();
    }

    function handleDeploy(): void {
        if (selectedTarget === undefined) {
            return;
        }
        confirm(`Publish to "${selectedTarget.id}"? This writes the generated artifacts to the target's own output location.`, () => {
            pendingAdvanceStepRef.current = 5;
            onDeploy();
        });
    }

    // "partial" is this classification's own name for "a preview run with no failing stage" -- see
    // describeDeploymentOutcome's own doc comment. That's exactly the gate for offering an actual Deploy:
    // never past content that's incompatible, invalid, or already known to fail the target's own
    // diagnostic, and never for a result that was itself already a real (publish: true) deploy attempt.
    const canContinueToDeploy = runResult !== undefined && !runResult.publish && outcome === "partial";
    const compatibilityChecked = runResult !== undefined;
    const previewReachable = runResult !== undefined && outcome !== "incompatible";
    const reviewReachable = runResult !== undefined && runResult.publish;

    // Configure's own gates -- every mode row's status, computed the exact same way its own badge is (see
    // DeploymentModeRow), a target-capability-aware "is there room for another row" check, and the
    // plain-language blockers list built from those statuses. `runError`'s own "mode "<name>": ..." prefix
    // (see StudioDeploymentService.run()) is the only way a row can read "invalid" before a fresh
    // Check-compatibility run reclassifies it -- see classifyDeploymentModeRow's own doc comment. While the
    // project's own build modes aren't known yet, buildModesUnavailableMessage takes over as the sole
    // blocker -- there is nothing a per-row status could meaningfully report when no row can even pick a
    // real mode yet (see describeBuildModesUnavailable's own doc comment).
    const buildModeIds = projectModesView.status === "ok" ? projectModesView.modeIds : undefined;
    const buildModesUnavailableMessage = describeBuildModesUnavailable(buildModeIds);
    const modeStatuses = modes.map((mode, index) => classifyDeploymentModeRow(mode, index, modes, registryView ?? {status: "load-error", error: ""}, runError));
    const configureBlockers = buildModesUnavailableMessage !== undefined ? [buildModesUnavailableMessage] : computeDeploymentConfigureBlockers(modes, modeStatuses);
    const canAddMode = canAddDeploymentMode(buildModeIds, modes, selectedTarget?.capabilities.includes(MULTI_MODE_CAPABILITY_ID) ?? false);

    return (
        <div>
            <Text size="sm" c="dimmed" mb="sm">
                Deploys canonical outcome libraries -- never the game package or blueprint itself -- to a registered
                external deployment target via the pokie package&apos;s own External Adapter SDK. Each mode below maps to
                one bet mode from the project&apos;s own build; the built package/blueprint only supplies provenance
                context (game id, version, config) used to judge whether a library is still compatible, never the
                deployed content itself. &quot;Check &amp; Preview&quot; runs the full pipeline (compatibility check,
                projection, generation, artifact validation, target diagnostic) without writing anything;
                &quot;Deploy&quot; additionally publishes the generated artifacts to the target.
            </Text>

            <Stepper active={activeStep} onStepClick={setActiveStep} mb="md" size="sm">
                <Stepper.Step label="Select target" description="Where to publish" aria-current={activeStep === 0 ? "step" : undefined} />
                <Stepper.Step
                    label="Configure"
                    description="Modes & libraries"
                    disabled={selectedTarget === undefined}
                    aria-current={activeStep === 1 ? "step" : undefined}
                />
                <Stepper.Step
                    label="Check compatibility"
                    description="Preflight"
                    disabled={!compatibilityChecked}
                    aria-current={activeStep === 2 ? "step" : undefined}
                />
                <Stepper.Step
                    label="Preview artifacts"
                    description="What would be generated"
                    disabled={!previewReachable}
                    aria-current={activeStep === 3 ? "step" : undefined}
                />
                <Stepper.Step label="Deploy" description="Publish" disabled={!canContinueToDeploy} aria-current={activeStep === 4 ? "step" : undefined} />
                <Stepper.Step label="Review result" description="Outcome" disabled={!reviewReachable} aria-current={activeStep === 5 ? "step" : undefined} />
            </Stepper>

            {activeStep === 0 && (
                <div>
                    <QuickActions>
                        <Button variant="default" size="xs" onClick={onRefreshTargets}>
                            Refresh
                        </Button>
                    </QuickActions>
                    {targetsError && <ErrorState message={targetsError} />}
                    <SelectTargetStep
                        view={targetsView}
                        selectedTarget={selectedTarget}
                        onSelectTarget={handleSelectTarget}
                        onOpenStakeEngineExport={onOpenStakeEngineExport}
                    />
                </div>
            )}

            {activeStep === 1 &&
                (selectedTarget === undefined ? (
                    <EmptyState message="Select a target first." />
                ) : (
                    <div>
                        <Text size="sm" mb="sm">
                            Target: <strong>{selectedTarget.id}</strong>
                        </Text>
                        <Text size="sm" c="dimmed" mb="sm">
                            Each mode below deploys one bet mode&apos;s canonical outcome library. A row&apos;s own status
                            shows whether that library is Ready, Missing, from the Wrong build, Invalid, or a Duplicate of
                            another row -- discovered automatically from the Outcome Libraries registry when possible,
                            otherwise choose a file, generate one, or open the hub.
                        </Text>
                        {buildModesUnavailableMessage !== undefined && (
                            <Alert color="yellow" variant="light" icon={<IconAlertTriangle size={16} />} mb="sm">
                                {buildModesUnavailableMessage}
                            </Alert>
                        )}

                        <PageSection legend="Deployment modes">
                            {modes.map((mode, index) => (
                                <DeploymentModeRow
                                    key={index}
                                    mode={mode}
                                    index={index}
                                    modes={modes}
                                    projectModesView={projectModesView}
                                    registryView={registryView}
                                    lastRunError={runError}
                                    projectRoot={projectRoot}
                                    canRemove={modes.length > 1}
                                    onModeNameChange={(modeName) => onSetModeName(index, modeName)}
                                    onLibrarySelectorChange={(selector) => onSetModeLibrarySelector(index, selector)}
                                    onRemove={() => onRemoveMode(index)}
                                    onOpenOutcomeLibraries={onOpenOutcomeLibraries}
                                />
                            ))}
                            <QuickActions>
                                <Button variant="default" onClick={onAddMode} disabled={!canAddMode}>
                                    Add mode
                                </Button>
                            </QuickActions>
                            {!canAddMode && selectedTarget !== undefined && !selectedTarget.capabilities.includes(MULTI_MODE_CAPABILITY_ID) && (
                                <Text size="xs" c="dimmed" mt={4}>
                                    &quot;{selectedTarget.id}&quot; doesn&apos;t declare multiMode support -- it only accepts one mode per
                                    deployment.
                                </Text>
                            )}
                        </PageSection>

                        {configureBlockers.length > 0 && <IssueList title="Before you can continue" issues={configureBlockers.map((message) => ({message}))} />}

                        <QuickActions>
                            <Button onClick={handleCheckAndPreview} loading={runLoading} disabled={configureBlockers.length > 0}>
                                Check compatibility &amp; preview
                            </Button>
                        </QuickActions>
                        {runLoading && <LoadingState label="Running…" />}
                        {runError && <ErrorState message={describePathActionError("The deployment's outcome library file", runError)} />}
                    </div>
                ))}

            {activeStep === 2 &&
                (runResult === undefined ? (
                    <EmptyState message="Run a compatibility check from Configure first." />
                ) : (
                    <div>
                        <DeploymentOutcomeBanner
                            outcome={outcome === "incompatible" ? "incompatible" : "success"}
                            issues={collectStageIssues(runResult.stages, COMPATIBILITY_STAGE_KEYS)}
                        />
                        {outcome === "incompatible" ? (
                            <QuickActions>
                                <Button variant="default" onClick={() => setActiveStep(1)}>
                                    Back to Configure
                                </Button>
                                <Button variant="default" onClick={() => setActiveStep(0)}>
                                    Choose a different target
                                </Button>
                            </QuickActions>
                        ) : (
                            <QuickActions>
                                <Button onClick={() => setActiveStep(3)}>Continue to Preview artifacts</Button>
                            </QuickActions>
                        )}
                    </div>
                ))}

            {activeStep === 3 &&
                (runResult === undefined || outcome === "incompatible" ? (
                    <EmptyState message="Check compatibility first." />
                ) : (
                    <div>
                        {outcome === "validation-failure" && (
                            <DeploymentOutcomeBanner outcome={outcome} issues={collectStageIssues(runResult.stages, PREVIEW_STAGE_KEYS)} />
                        )}
                        {outcome === "transport-failure" && (
                            <DeploymentOutcomeBanner outcome={outcome} issues={collectStageIssues(runResult.stages, TRANSPORT_STAGE_KEYS)} />
                        )}

                        <PageSection legend="Generated artifacts">
                            {runResult.artifacts.length === 0 ? (
                                <EmptyState message="No artifacts were generated." />
                            ) : (
                                <List listStyleType="none" spacing={4}>
                                    {runResult.artifacts.map((artifact) => (
                                        <List.Item key={artifact.relativePath}>
                                            <Anchor
                                                component="button"
                                                type="button"
                                                onClick={() => onSelectArtifact(artifact.relativePath)}
                                                style={{overflowWrap: "anywhere", whiteSpace: "normal", textAlign: "left"}}
                                            >
                                                {artifact.relativePath}
                                            </Anchor>
                                        </List.Item>
                                    ))}
                                </List>
                            )}
                        </PageSection>

                        {(outcome === "partial" || outcome === "success") && (
                            <Alert color="green" variant="light" icon={<IconCircleCheck size={16} />} mb="sm">
                                Target diagnostic passed -- this target is reachable and ready.
                            </Alert>
                        )}

                        <QuickActions>
                            {canContinueToDeploy && <Button onClick={() => setActiveStep(4)}>Continue to Deploy</Button>}
                            <Button variant="default" onClick={() => setActiveStep(1)}>
                                Back to Configure
                            </Button>
                        </QuickActions>

                        <AdvancedRunDetails runResult={runResult} selectedArtifact={selectedArtifact} />
                    </div>
                ))}

            {activeStep === 4 &&
                (!canContinueToDeploy ? (
                    <EmptyState message="A successful preview is required before deploying -- go back and run Check compatibility & preview." />
                ) : (
                    <div>
                        <Text size="sm" mb="sm">
                            Target: <strong>{selectedTarget?.id}</strong> — {modes.length} mode(s), {runResult?.artifacts.length ?? 0} artifact(s) ready
                            to publish.
                        </Text>
                        <QuickActions>
                            <Button onClick={handleDeploy} loading={runLoading}>
                                Deploy
                            </Button>
                        </QuickActions>
                        {runLoading && <LoadingState label="Deploying…" />}
                        {runError && <ErrorState message={describePathActionError("The deployment's outcome library file", runError)} />}
                    </div>
                ))}

            {activeStep === 5 &&
                (!reviewReachable || runResult === undefined || outcome === undefined ? (
                    <EmptyState message="Nothing has been deployed yet." />
                ) : (
                    <div>
                        <DeploymentOutcomeBanner outcome={outcome} issues={collectStageIssues(runResult.stages, stageKeysForOutcome(outcome))} />
                        <Text size="sm">{runResult.delivered ? "Delivered to the target." : "Not delivered."}</Text>

                        <AdvancedRunDetails runResult={runResult} selectedArtifact={selectedArtifact} />

                        <QuickActions>
                            <Button variant="default" onClick={() => setActiveStep(1)}>
                                Deploy again
                            </Button>
                        </QuickActions>
                    </div>
                ))}
        </div>
    );
}
