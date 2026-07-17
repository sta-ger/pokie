import {Alert, Anchor, Button, List, Stepper, Text, TextInput} from "@mantine/core";
import {useDisclosure} from "@mantine/hooks";
import {IconAlertTriangle, IconCircleCheck} from "@tabler/icons-react";
import {useEffect, useRef, useState, type ReactNode} from "react";
import type {StudioDeploymentModeInput, StudioDeploymentStageSummary, StudioDeploymentTargetSummary} from "../../api/types";
import {
    collectStageIssues,
    COMPATIBILITY_STAGE_KEYS,
    describeDeploymentOutcome,
    describeTargetCapability,
    describeTargetRequirements,
    PREVIEW_STAGE_KEYS,
    splitIssuesBySeverity,
    TRANSPORT_STAGE_KEYS,
    type DeploymentOutcomeKind,
    type DeploymentRunResultView,
    type DeploymentTargetsListView,
} from "../../domain/interpret/Deployment";
import {useConfirm} from "../../hooks/useConfirm";
import {CodeBlock} from "../common/CodeBlock";
import {EmptyState} from "../common/EmptyState";
import {ErrorState} from "../common/ErrorState";
import {IssueList} from "../common/IssueList";
import {LoadingState} from "../common/LoadingState";
import {PageSection} from "../common/PageSection";
import {QuickActions} from "../common/QuickActions";

const OUTCOME_BANNER: Record<DeploymentOutcomeKind, {color: string; icon: ReactNode; title: string}> = {
    success: {color: "green", icon: <IconCircleCheck size={16} />, title: "Deployed successfully"},
    partial: {color: "blue", icon: <IconCircleCheck size={16} />, title: "Preview succeeded -- ready to deploy"},
    incompatible: {color: "red", icon: <IconAlertTriangle size={16} />, title: "Incompatible with this target"},
    "validation-failure": {color: "orange", icon: <IconAlertTriangle size={16} />, title: "Content didn't validate for this target"},
    "transport-failure": {color: "red", icon: <IconAlertTriangle size={16} />, title: "Target couldn't be reached or written to"},
};

function TargetsList({
    view,
    selectedTargetId,
    onSelect,
}: {
    view: DeploymentTargetsListView;
    selectedTargetId: string | undefined;
    onSelect: (target: StudioDeploymentTargetSummary) => void;
}) {
    if (view.status === "loading") {
        return <LoadingState label="Loading deployment targets…" />;
    }
    if (view.status === "empty") {
        return <EmptyState message="No deployment targets registered." />;
    }
    return (
        <List listStyleType="none" spacing="md">
            {view.targets.map((target) => (
                <List.Item key={target.id}>
                    <Text fw={600}>
                        {target.id} (v{target.version})
                    </Text>
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
                    <Button size="xs" mt="sm" variant={target.id === selectedTargetId ? "filled" : "default"} onClick={() => onSelect(target)}>
                        {target.id === selectedTargetId ? "Selected" : "Select"}
                    </Button>
                </List.Item>
            ))}
        </List>
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
// of stage-key group), never re-deriving pass/fail themselves.
function OutcomeBanner({outcome, issues}: {outcome: DeploymentOutcomeKind; issues: ReturnType<typeof collectStageIssues>}) {
    const {errors, warnings} = splitIssuesBySeverity(issues);
    const banner = OUTCOME_BANNER[outcome];
    return (
        <Alert color={banner.color} variant="light" icon={banner.icon} title={banner.title} mb="sm">
            <IssueList title="Errors" issues={errors} />
            <IssueList title="Warnings" issues={warnings} />
            {errors.length === 0 && warnings.length === 0 && (
                <Text size="sm" c="dimmed">
                    No issues reported.
                </Text>
            )}
        </Alert>
    );
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
    const [opened, {toggle}] = useDisclosure(false);
    return (
        <div>
            <Text size="sm" mt="sm">
                <Anchor component="button" type="button" onClick={toggle}>
                    {opened ? "Hide" : "Show"} advanced details (raw artifacts, full pipeline diagnostics)
                </Anchor>
            </Text>
            {opened && (
                <PageSection legend="Advanced details">
                    <List size="sm">
                        {runResult.stages.map((stage) => (
                            <List.Item key={stage.key}>
                                {stage.label}: {stage.status}
                                {stage.issues.length > 0 && (
                                    <List size="sm" withPadding>
                                        {stage.issues.map((issue, index) => (
                                            <List.Item key={index}>
                                                {issue.severity}: {issue.message}
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
                </PageSection>
            )}
        </div>
    );
}

export function DeploymentTab({
    targetsView,
    targetsError,
    onRefreshTargets,
    selectedTarget,
    onSelectTarget,
    modes,
    onUpdateMode,
    onAddMode,
    onRemoveMode,
    onPreview,
    onDeploy,
    runResult,
    runError,
    runLoading,
    selectedArtifactPath,
    onSelectArtifact,
}: {
    targetsView: DeploymentTargetsListView;
    targetsError: string | undefined;
    onRefreshTargets: () => void;
    selectedTarget: StudioDeploymentTargetSummary | undefined;
    onSelectTarget: (target: StudioDeploymentTargetSummary) => void;
    modes: StudioDeploymentModeInput[];
    onUpdateMode: (index: number, patch: Partial<StudioDeploymentModeInput>) => void;
    onAddMode: () => void;
    onRemoveMode: (index: number) => void;
    onPreview: () => void;
    onDeploy: () => void;
    runResult: DeploymentRunResultView | undefined;
    runError: string | undefined;
    runLoading: boolean;
    selectedArtifactPath: string | undefined;
    onSelectArtifact: (path: string) => void;
}) {
    const confirm = useConfirm();
    const [activeStep, setActiveStep] = useState(0);
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

    return (
        <div>
            <Text size="sm" c="dimmed" mb="sm">
                Deploys a canonical outcome library to a registered external deployment target via the pokie package&apos;s
                own External Adapter SDK. &quot;Check &amp; Preview&quot; runs the full pipeline (compatibility check,
                projection, generation, artifact validation, target diagnostic) without writing anything; &quot;Deploy&quot;
                additionally publishes the generated artifacts to the target.
            </Text>

            <Stepper active={activeStep} onStepClick={setActiveStep} mb="md" size="sm">
                <Stepper.Step label="Select target" description="Where to publish" />
                <Stepper.Step label="Configure" description="Modes & libraries" disabled={selectedTarget === undefined} />
                <Stepper.Step label="Check compatibility" description="Preflight" disabled={!compatibilityChecked} />
                <Stepper.Step label="Preview artifacts" description="What would be generated" disabled={!previewReachable} />
                <Stepper.Step label="Deploy" description="Publish" disabled={!canContinueToDeploy} />
                <Stepper.Step label="Review result" description="Outcome" disabled={!reviewReachable} />
            </Stepper>

            {activeStep === 0 && (
                <div>
                    <QuickActions>
                        <Button variant="default" onClick={onRefreshTargets}>
                            Refresh
                        </Button>
                    </QuickActions>
                    {targetsError && <ErrorState message={targetsError} />}
                    <TargetsList view={targetsView} selectedTargetId={selectedTarget?.id} onSelect={handleSelectTarget} />
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
                            Each mode below deploys one bet mode&apos;s canonical outcome library -- the library path is
                            relative to the project root, the same file a Simulation run or `pokie build` would use.
                        </Text>

                        {modes.map((mode, index) => (
                            <QuickActions key={index}>
                                <TextInput
                                    label="Mode name"
                                    value={mode.modeName}
                                    onChange={(event) => onUpdateMode(index, {modeName: event.currentTarget.value})}
                                />
                                <TextInput
                                    label="Outcome library path"
                                    value={mode.libraryPath}
                                    onChange={(event) => onUpdateMode(index, {libraryPath: event.currentTarget.value})}
                                />
                                <Button variant="subtle" color="red" onClick={() => onRemoveMode(index)}>
                                    Remove
                                </Button>
                            </QuickActions>
                        ))}
                        <QuickActions>
                            <Button variant="default" onClick={onAddMode}>
                                Add mode
                            </Button>
                        </QuickActions>

                        <QuickActions>
                            <Button onClick={handleCheckAndPreview} loading={runLoading}>
                                Check compatibility &amp; preview
                            </Button>
                        </QuickActions>
                        {runLoading && <LoadingState label="Running…" />}
                        {runError && <ErrorState message={runError} />}
                    </div>
                ))}

            {activeStep === 2 &&
                (runResult === undefined ? (
                    <EmptyState message="Run a compatibility check from Configure first." />
                ) : (
                    <div>
                        <OutcomeBanner
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
                                <Button onClick={() => setActiveStep(3)}>Continue to preview artifacts</Button>
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
                            <OutcomeBanner outcome={outcome} issues={collectStageIssues(runResult.stages, PREVIEW_STAGE_KEYS)} />
                        )}
                        {outcome === "transport-failure" && (
                            <OutcomeBanner outcome={outcome} issues={collectStageIssues(runResult.stages, TRANSPORT_STAGE_KEYS)} />
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
                        {runError && <ErrorState message={runError} />}
                    </div>
                ))}

            {activeStep === 5 &&
                (!reviewReachable || runResult === undefined || outcome === undefined ? (
                    <EmptyState message="Nothing has been deployed yet." />
                ) : (
                    <div>
                        <OutcomeBanner outcome={outcome} issues={collectStageIssues(runResult.stages, stageKeysForOutcome(outcome))} />
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
