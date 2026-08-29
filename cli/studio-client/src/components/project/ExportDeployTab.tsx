import {useEffect, useRef, useState} from "react";
import {Badge, Button, Group, List, Text, TextInput} from "@mantine/core";
import {
    cancelArtifactBuild,
    checkNativePickerAvailability,
    cancelOutcomeLibraryGeneration,
    estimateOutcomeLibraryGeneration,
    getOutcomeLibraryGenerationJob,
    listOutcomeLibraryGenerationJobs,
    getArtifactBuild,
    listArtifactTargets,
    openOutputFolder,
    previewArtifact,
    revealOutputPath,
    registerProjectImport,
    resumeOutcomeLibraryGeneration,
    startOutcomeLibraryGeneration,
    startArtifactBuild,
    OutcomeLibraryGenerationStartError,
} from "../../api/apiClient";
import type {
    StudioArtifactBuildView,
    StudioArtifactBuildJobView,
    StudioArtifactConversionPlan,
    StudioArtifactPreviewView,
    StudioArtifactTargetType,
    StudioArtifactTargetView,
    StudioOutcomeLibraryGenerateResultView,
    StudioOutcomeLibraryGenerateJobView,
    StudioOutcomeLibraryGenerateEstimateView,
    StudioProjectCapability,
} from "../../api/types";
import {useStudioApi} from "../../context/StudioApiProvider";
import {
    describeArtifactBuildTargetCards,
    describeExportDeployTargetCards,
    type ExportDeployTargetCard,
    type ExportDeployTargetKind,
} from "../../domain/interpret/ExportDeployTargets";
import {errorMessage} from "../../domain/errorMessage";
import {describeProjectActionError} from "../../domain/projectActionError";
import {describeOutcomeLibraryGenerationTerminalOutcome} from "../../domain/outcomeLibraryGenerateError";
import type {DeploymentManager} from "../../hooks/useDeploymentManager";
import {useDoubleSubmitGuard} from "../../hooks/useDoubleSubmitGuard";
import {useOpenProject} from "../../hooks/useOpenProject";
import {EmptyState} from "../common/EmptyState";
import {ErrorState} from "../common/ErrorState";
import {AdvancedDisclosure} from "../common/AdvancedDisclosure";
import {IssueList} from "../common/IssueList";
import {LoadingState} from "../common/LoadingState";
import {PageSection} from "../common/PageSection";
import {QuickActions} from "../common/QuickActions";
import {PathInput} from "../common/PathInput";

const GROUP_LABELS: Record<ExportDeployTargetKind, {legend: string; blurb: string}> = {
    outcomeLibrary: {
        legend: "Outcome libraries",
        blurb: "Create the game outcomes used by the export and delivery options below.",
    },
    buildArtifact: {
        legend: "Build artifact",
        blurb: "Create a project file or package that can be opened or shared.",
    },
    remoteDeployment: {
        legend: "Remote deployment",
        blurb: "Check a configured delivery destination before publishing to it.",
    },
};

function artifactFileFilters(target: StudioArtifactTargetType) {
    if (target === "parWorkbook") return [{name: "Excel workbooks", extensions: ["xlsx"]}];
    if (target === "blueprint") return [{name: "Blueprint JSON", extensions: ["json"]}];
    return undefined;
}

function artifactDestinationTitle(target: StudioArtifactTargetType): string {
    if (target === "parWorkbook") return "Choose a PAR workbook destination";
    if (target === "blueprint") return "Choose an imported Blueprint destination";
    return "Choose an artifact output directory";
}

const GROUP_ORDER: readonly ExportDeployTargetKind[] = ["outcomeLibrary", "buildArtifact", "remoteDeployment"];

// Every "Configure"/etc-free run below runs against this single project-wide mode name -- the project's
// own first current build mode when known, "base" (the same fallback generateOutcomeLibrary's own
// server-side request validator already applies) otherwise. Build/Export is deliberately a single-mode,
// zero-configuration surface -- this is the sole Studio build surface now (see ProjectDashboardPage.tsx's
// own doc comment on the legacy Deployment/Stake Engine Export/Outcome Libraries routes), so a project
// that genuinely needs a multi-mode bundle has no separate dedicated workflow to fall back to yet.
function resolveDefaultModeName(projectModesView: DeploymentManager["projectModesView"]): string {
    return projectModesView.status === "ok" && projectModesView.modeIds.length > 0 ? projectModesView.modeIds[0] : "base";
}

// Both choices intentionally map one-to-one onto generateExactWeightedOutcomeLibrary's public
// options. In particular, enabling bounded coverage remains an explicit user decision: setting a
// sample size alone can never silently turn an exact request into a sampled one.
type OutcomeLibraryGenerationOptions = {
    mode: string;
    stake: string;
    libraryId: string;
    configHash: string;
    outDir: string;
    maxOutcomeSpaceSize: string;
    generation: "default" | "exact" | "sampled" | "bounded";
    sampleSize: string;
    seed: string;
};

type OutcomeLibraryRunView =
    | {status: "idle"}
    | {status: "running"; job: StudioOutcomeLibraryGenerateJobView}
    | {status: "ok"; result: Extract<StudioOutcomeLibraryGenerateResultView, {status: "ok"}>}
    | {status: "cancelled"; result: Extract<StudioOutcomeLibraryGenerateResultView, {status: "cancelled"}>}
    | {status: "error"; message: string; diagnostic?: string; plan?: StudioArtifactConversionPlan};

type OutcomeLibraryPreflightView =
    | {status: "loading"}
    | {status: "ok"; result: Extract<StudioOutcomeLibraryGenerateEstimateView, {status: "ok"}>}
    | {status: "error"; result?: Exclude<StudioOutcomeLibraryGenerateEstimateView, {status: "ok"}>; message?: string};

function describeGenerateResultError(view: Exclude<StudioOutcomeLibraryGenerateResultView, {status: "ok"}>): string {
    return describeOutcomeLibraryGenerationTerminalOutcome(view);
}

function describePreflightError(view: Exclude<StudioOutcomeLibraryGenerateEstimateView, {status: "ok"}>): string {
    if (view.status === "invalid") return "This generation request is invalid. Correct the settings below, then refresh the preflight.";
    return describeOutcomeLibraryGenerationTerminalOutcome(view);
}

function generationStrategyLabel(generation: OutcomeLibraryGenerationOptions["generation"]): string {
    const labels: Record<OutcomeLibraryGenerationOptions["generation"], string> = {
        default: "Default (exact until cap)",
        exact: "Exact",
        sampled: "Sampled",
        bounded: "Conditional bounded",
    };
    return labels[generation];
}

function PlannerSummary({plan, label = "Server plan"}: {plan: StudioArtifactConversionPlan | undefined; label?: string}) {
    if (plan === undefined) return null;
    const summary =
        plan.status === "planned"
            ? plan.steps.map((step) => `${step.choice} ${step.kind}`).join(" → ") || "No publication required"
            : `${plan.status === "conflict" ? "Conflict" : "Unavailable"}${plan.diagnostic?.message === undefined ? "" : ` — ${plan.diagnostic.message}`}`;
    return (
        <Text size="sm" c="dimmed" mt={4}>
            {label}: {summary}
        </Text>
    );
}

// One entry per "buildArtifact" card, keyed by its own artifactTarget -- each target runs (and reports)
// independently of every other.
type ArtifactBuildRunView =
    | {status: "idle"}
    | {status: "running"; jobId: string; progress?: StudioArtifactBuildJobView["progress"]; cancellationRequested: boolean}
    // Keep the server's last in-flight preflight with the successful result. A very small build can
    // complete between React renders; without retaining it, the user never sees the estimate that
    // governed the build they just started.
    | {status: "ok"; result: Extract<StudioArtifactBuildView, {status: "ok"}>; progress?: StudioArtifactBuildJobView["progress"]}
    | {status: "cancelled"; plan: StudioArtifactConversionPlan}
    | {status: "error"; message: string; plan?: StudioArtifactConversionPlan};

function describeArtifactBuildResultError(view: Exclude<StudioArtifactBuildView, {status: "ok"}>): string {
    return view.message;
}

// One entry per "buildArtifact" card's own registry-backed preview -- fetched automatically once its own
// target is known to be supported (see the artifactPreviews effect below), never behind an explicit click,
// so a real destination and any conflict/diagnostic is already on screen before Build is ever pressed. Keyed
// by artifactTarget, same convention as ArtifactBuildRunView above.
type ArtifactPreviewRunView =
    | {status: "loading"}
    | {status: "ok"; result: Extract<StudioArtifactPreviewView, {status: "ok"}>}
    | {status: "unsupported"; message: string; plan: StudioArtifactConversionPlan}
    | {status: "conflict"; result: Extract<StudioArtifactPreviewView, {status: "conflict"}>}
    // Transport failures have no server terminal result. Every server preview
    // error still carries its mandatory plan through toArtifactPreviewRunView.
    | {status: "error"; message: string; plan?: StudioArtifactConversionPlan};

function toArtifactPreviewRunView(view: StudioArtifactPreviewView): ArtifactPreviewRunView {
    if (view.status === "ok") {
        return {status: "ok", result: view};
    }
    if (view.status === "conflict") {
        return {status: "conflict", result: view};
    }
    return view.status === "unsupported"
        ? {status: "unsupported", message: view.message, plan: view.plan}
        : {status: "error", message: view.message, plan: view.plan};
}

function TargetCard({
    card,
    defaultModeName,
    outcomeLibraryRun,
    outcomeLibraryPreflight,
    onGenerateOutcomeLibrary,
    onCancelOutcomeLibrary,
    onResumeOutcomeLibrary,
    outcomeLibraryGenerationOptions,
    onOutcomeLibraryGenerationOptionsChange,
    deployment,
    onOpenFolder,
    artifactPreview,
    artifactBuildRun,
    onBuildArtifact,
    onCancelArtifactBuild,
    artifactDestination,
    onArtifactDestinationChange,
    onOpenAsProject,
    onAddToProjects,
    addedToProjects,
    onRevealOutput,
    outputActionsUnavailable,
    onCopyPath,
}: {
    card: ExportDeployTargetCard;
    defaultModeName: string;
    outcomeLibraryRun: OutcomeLibraryRunView;
    outcomeLibraryPreflight: OutcomeLibraryPreflightView;
    onGenerateOutcomeLibrary: () => void;
    onCancelOutcomeLibrary: () => void;
    onResumeOutcomeLibrary: () => void;
    outcomeLibraryGenerationOptions: OutcomeLibraryGenerationOptions;
    onOutcomeLibraryGenerationOptionsChange: (options: OutcomeLibraryGenerationOptions) => void;
    deployment: DeploymentManager;
    onOpenFolder: (path: string) => void;
    artifactPreview: ArtifactPreviewRunView;
    artifactBuildRun: ArtifactBuildRunView;
    onBuildArtifact: (target: StudioArtifactTargetType) => void;
    onCancelArtifactBuild: (target: StudioArtifactTargetType) => void;
    artifactDestination: string;
    onArtifactDestinationChange: (target: StudioArtifactTargetType, destination: string) => void;
    onOpenAsProject: (projectRoot: string) => void;
    onAddToProjects: (projectRoot: string) => void;
    addedToProjects: boolean;
    onRevealOutput: (path: string) => void;
    outputActionsUnavailable: boolean;
    onCopyPath: (path: string) => void;
}) {
    const isActiveTarget = card.deploymentTarget !== undefined && deployment.selectedTarget?.id === card.deploymentTarget.id;
    const previewedOk = isActiveTarget && deployment.runResult?.ok === true && deployment.runResult.publish === false;
    const canBuildArtifact = artifactPreview.status === "ok" && artifactBuildRun.status !== "running";

    return (
        <div style={{marginBottom: "1rem", paddingBottom: "1rem", borderBottom: "1px solid var(--mantine-color-default-border)"}}>
            <Group gap="xs" mb={4}>
                <Text fw={600}>{card.label}</Text>
                <Badge size="sm" color={card.locality === "local" ? "blue" : "grape"} variant="light">
                    {card.locality === "local" ? "This computer" : "Remote"}
                </Badge>
            </Group>
            <Text size="sm" mt={4}>
                <Text span fw={600}>
                    Purpose:
                </Text>{" "}
                {card.purpose}
            </Text>
            <Text size="sm" mt={4}>
                <Text span fw={600}>
                    Destination:
                </Text>{" "}
                {card.destination}
            </Text>
            {!card.supported && (
                <>
                    <Text size="sm" fw={600} mt={4}>
                        Unavailable for this project
                    </Text>
                    <List size="sm" withPadding>
                        {card.unavailableReasons.map((reason, index) => (
                            <List.Item key={index}>{reason}</List.Item>
                        ))}
                    </List>
                </>
            )}
            {card.prerequisites.length > 0 && (
                <>
                    <Text size="sm" fw={600} mt={4}>
                        Prerequisites
                    </Text>
                    <List size="sm" withPadding>
                        {card.prerequisites.map((prerequisite, index) => (
                            <List.Item key={index}>{prerequisite}</List.Item>
                        ))}
                    </List>
                </>
            )}

            {card.kind === "outcomeLibrary" && (
                <>
                    <TextInput
                        mt="sm"
                        label="Mode"
                        description={`Leave blank to generate the current default mode (${defaultModeName}).`}
                        value={outcomeLibraryGenerationOptions.mode}
                        onChange={(event) =>
                            onOutcomeLibraryGenerationOptionsChange({...outcomeLibraryGenerationOptions, mode: event.currentTarget.value})
                        }
                    />
                    <Group align="start" grow mt="sm">
                        <TextInput
                            label="Output destination"
                            description="Project-relative bundle directory. Existing modes are preserved safely."
                            value={outcomeLibraryGenerationOptions.outDir}
                            onChange={(event) =>
                                onOutcomeLibraryGenerationOptionsChange({...outcomeLibraryGenerationOptions, outDir: event.currentTarget.value})
                            }
                        />
                        <TextInput
                            label="Library identity"
                            description="Optional stable library ID; blank uses the game and mode."
                            value={outcomeLibraryGenerationOptions.libraryId}
                            onChange={(event) =>
                                onOutcomeLibraryGenerationOptionsChange({...outcomeLibraryGenerationOptions, libraryId: event.currentTarget.value})
                            }
                        />
                    </Group>
                    <Group align="start" grow mt="sm">
                        <TextInput
                            label="Stake"
                            description="Optional positive stake recorded on generated outcomes."
                            inputMode="decimal"
                            value={outcomeLibraryGenerationOptions.stake}
                            onChange={(event) =>
                                onOutcomeLibraryGenerationOptionsChange({...outcomeLibraryGenerationOptions, stake: event.currentTarget.value})
                            }
                        />
                        <TextInput
                            label="Configuration identity"
                            description="Optional loaded configuration identity to verify; it never overrides the loaded game provenance."
                            value={outcomeLibraryGenerationOptions.configHash}
                            onChange={(event) =>
                                onOutcomeLibraryGenerationOptionsChange({...outcomeLibraryGenerationOptions, configHash: event.currentTarget.value})
                            }
                        />
                    </Group>
                    <TextInput
                        mt="sm"
                        label="Max outcome space size"
                        description="Exact generation stops above this many reel-stop combinations. Raise it only when the full library is practical to generate and store."
                        inputMode="numeric"
                        value={outcomeLibraryGenerationOptions.maxOutcomeSpaceSize}
                        onChange={(event) =>
                            onOutcomeLibraryGenerationOptionsChange({...outcomeLibraryGenerationOptions, maxOutcomeSpaceSize: event.currentTarget.value})
                        }
                    />
                    <Text size="sm" mt="sm" fw={600}>Generation strategy</Text>
                    <Group gap="xs" mt={4}>
                        {(["default", "exact", "sampled", "bounded"] as const).map((generation) => (
                            <Button key={generation} size="xs" variant={outcomeLibraryGenerationOptions.generation === generation ? "filled" : "default"} onClick={() => onOutcomeLibraryGenerationOptionsChange({...outcomeLibraryGenerationOptions, generation})}>
                                {generationStrategyLabel(generation)}
                            </Button>
                        ))}
                    </Group>
                    {(outcomeLibraryGenerationOptions.generation === "sampled" || outcomeLibraryGenerationOptions.generation === "bounded") && (
                        <Group align="start" grow mt="sm">
                            <TextInput
                                label="Sample size"
                                description="Number of deterministic reel-stop draws to include."
                                inputMode="numeric"
                                value={outcomeLibraryGenerationOptions.sampleSize}
                                onChange={(event) =>
                                    onOutcomeLibraryGenerationOptionsChange({...outcomeLibraryGenerationOptions, sampleSize: event.currentTarget.value})
                                }
                            />
                            <TextInput
                                label="Coverage seed"
                                description="Saved with the generated library so this sample can be reproduced."
                                value={outcomeLibraryGenerationOptions.seed}
                                onChange={(event) => onOutcomeLibraryGenerationOptionsChange({...outcomeLibraryGenerationOptions, seed: event.currentTarget.value})}
                            />
                        </Group>
                    )}
                    <Text size="sm" mt="sm" fw={600}>Generation preflight</Text>
                    {outcomeLibraryPreflight.status === "loading" && <Text size="sm" c="dimmed">Checking outcome space and generation plan…</Text>}
                    {outcomeLibraryPreflight.status === "error" && (
                        <>
                            <Text size="sm" c="red">{outcomeLibraryPreflight.result === undefined ? outcomeLibraryPreflight.message ?? "Preflight could not be prepared." : describePreflightError(outcomeLibraryPreflight.result)} Refresh the preflight after resolving this issue.</Text>
                            {outcomeLibraryPreflight.result !== undefined && <AdvancedDisclosure label="Preflight diagnostic"><Text size="sm">{outcomeLibraryPreflight.result.error}</Text></AdvancedDisclosure>}
                        </>
                    )}
                    {outcomeLibraryPreflight.status === "ok" && (
                        <Text size="sm" c={outcomeLibraryPreflight.result.requiresBounded ? "orange" : "dimmed"}>
                            {outcomeLibraryPreflight.result.strategy === "exact" ? "Exact enumeration" : "Bounded coverage"}: {String(outcomeLibraryPreflight.result.totalOutcomeSpaceSize)} raw combinations; expected work {String(outcomeLibraryPreflight.result.expectedRawWork)}.
                            {outcomeLibraryPreflight.result.warnings.map((warning) => ` ${warning}`).join("")}
                        </Text>
                    )}
                    {outcomeLibraryPreflight.status === "ok" && outcomeLibraryPreflight.result.requiresBounded && outcomeLibraryGenerationOptions.generation !== "sampled" && outcomeLibraryGenerationOptions.generation !== "bounded" && (
                        <Text size="sm" c="orange">Choose sampled or conditional bounded coverage with a sample size and seed, or raise the exact limit before generating.</Text>
                    )}
                    <Button
                        size="xs"
                        mt="sm"
                        onClick={onGenerateOutcomeLibrary}
                        loading={outcomeLibraryRun.status === "running"}
                        disabled={outcomeLibraryPreflight.status !== "ok" || (outcomeLibraryPreflight.result.requiresBounded && outcomeLibraryGenerationOptions.generation !== "sampled" && outcomeLibraryGenerationOptions.generation !== "bounded")}
                    >
                        Generate {outcomeLibraryGenerationOptions.generation === "default" ? "exact" : outcomeLibraryGenerationOptions.generation} outcome library ({outcomeLibraryGenerationOptions.mode.trim() || defaultModeName})
                    </Button>
                    {outcomeLibraryRun.status === "running" && (
                        <>
                            <LoadingState label={outcomeLibraryRun.job.progress === undefined ? "Generating outcome library from this project's current build…" : `Generating outcome library: ${outcomeLibraryRun.job.progress.processedRawIndex} / ${outcomeLibraryRun.job.progress.progressTotal} raw combinations…`} />
                            <Button size="xs" color="red" variant="light" mt="xs" onClick={onCancelOutcomeLibrary}>Cancel generation</Button>
                        </>
                    )}
                    {outcomeLibraryRun.status === "error" && (
                        <>
                            <ErrorState message={outcomeLibraryRun.message} />
                            {outcomeLibraryRun.diagnostic !== undefined && <AdvancedDisclosure label="Generation diagnostic"><Text size="sm">{outcomeLibraryRun.diagnostic}</Text></AdvancedDisclosure>}
                            <PlannerSummary plan={outcomeLibraryRun.plan} />
                        </>
                    )}
                    {outcomeLibraryRun.status === "ok" && (
                        <>
                            <Text size="sm" mt={4}>
                                Generated {outcomeLibraryRun.result.mode.outcomeCount.toLocaleString()} outcomes for mode &quot;
                                {outcomeLibraryRun.result.mode.modeName}&quot; using {outcomeLibraryRun.result.generator.strategy}
                                {outcomeLibraryRun.result.generator.strategy === "bounded-coverage"
                                    ? ` (${(outcomeLibraryRun.result.coverage * 100).toFixed(4)}% of the raw space)`
                                    : ""}
                                {" "}(RTP {(outcomeLibraryRun.result.mode.rtp * 100).toFixed(2)}%) into{" "}
                                {outcomeLibraryRun.result.bundleDir}.{" "}
                                <Button size="xs" variant="default" onClick={() => onOpenFolder(outcomeLibraryRun.result.bundleDir)}>
                                    Open output folder
                                </Button>
                            </Text>
                            <PlannerSummary plan={outcomeLibraryRun.result.plan} />
                        </>
                    )}
                    {outcomeLibraryRun.status === "cancelled" && (
                        <>
                            <Text size="sm" c="orange" mt="sm">
                                Generation was cancelled at {outcomeLibraryRun.result.processedRawIndex} / {outcomeLibraryRun.result.progressTotal}. No incomplete library was published. {outcomeLibraryRun.result.checkpoint === undefined
                                    ? "Bounded coverage has no exact checkpoint; retry the same request to start a fresh deterministic sample."
                                    : "The exact checkpoint is saved safely; resume while the displayed source and configuration remain unchanged."}
                            </Text>
                            {outcomeLibraryRun.result.checkpoint !== undefined && <Button size="xs" variant="light" mt="xs" onClick={onResumeOutcomeLibrary}>Resume exact generation</Button>}
                            <PlannerSummary plan={outcomeLibraryRun.result.plan} />
                        </>
                    )}
                </>
            )}

            {card.kind === "buildArtifact" && card.artifactTarget && card.supported && (
                <>
                    <PathInput
                        label={card.artifactTarget === "parWorkbook" || card.artifactTarget === "blueprint" ? "Output file (optional)" : "Output directory (optional)"}
                        description="Choose a destination with your host picker, or type a server-filesystem path when Studio is headless or remote. Leave blank to use the shown default."
                        kind={card.artifactTarget === "parWorkbook" || card.artifactTarget === "blueprint" ? "file" : "directory"}
                        filePickerMode={card.artifactTarget === "parWorkbook" || card.artifactTarget === "blueprint" ? "save" : "open"}
                        fileFilters={artifactFileFilters(card.artifactTarget)}
                        browseTitle={artifactDestinationTitle(card.artifactTarget)}
                        browseId={`artifact-${card.artifactTarget}-destination`}
                        value={artifactDestination}
                        onChange={(event) => onArtifactDestinationChange(card.artifactTarget!, event.currentTarget.value)}
                        onPathSelected={(destination) => onArtifactDestinationChange(card.artifactTarget!, destination)}
                    />
                    {artifactPreview.status === "loading" && (
                        <Text size="sm" c="dimmed" mt={4}>
                            Checking destination…
                        </Text>
                    )}
                    {(artifactPreview.status === "ok" || artifactPreview.status === "conflict") && (
                        <div style={{marginTop: "0.5rem"}}>
                            <Text size="sm" fw={600}>
                                Build preflight
                            </Text>
                            <Text size="sm">Target: {card.label}</Text>
                            <Text size="sm">Selected destination: {artifactDestination.trim() || "Default destination"}</Text>
                            <Text size="sm">Resolved absolute path: {artifactPreview.result.destination}</Text>
                            <Text size="sm">Destination kind: {artifactPreview.result.destinationKind}</Text>
                            <Text size="sm">Status: {artifactPreview.status === "ok" ? "Ready to build" : "Choose a different destination"}</Text>
                            {"stakePreflight" in artifactPreview.result && artifactPreview.result.stakePreflight !== undefined && (
                                <Text size="sm" c="dimmed">
                                    Stake estimate: {artifactPreview.result.stakePreflight.estimatedItemCount ?? "item count will be measured from the selected library"} item(s)
                                    {artifactPreview.result.stakePreflight.estimatedBytes !== undefined ? `, ${artifactPreview.result.stakePreflight.estimatedBytes} bytes` : ""}.
                                    {artifactPreview.result.stakePreflight.warnings.length > 0 ? ` ${artifactPreview.result.stakePreflight.warnings.join(" ")}` : ""}
                                </Text>
                            )}
                            {artifactPreview.result.plan !== undefined && (
                                <>
                                    <Text size="sm">Plan: {artifactPreview.result.plan.steps.map((step) => `${step.choice} ${step.kind}`).join(" → ") || "No executable steps"}</Text>
                                    {artifactPreview.result.plan.steps.map((step, index) => (
                                        <Text key={`${step.kind}-${index}`} size="sm" c="dimmed">
                                            {step.choice === "reuse" ? "Reused" : "Durable/generated"} {step.output.kind}{step.output.canonicalLocation ? `: ${step.output.canonicalLocation}` : ""}
                                        </Text>
                                    ))}
                                    {artifactPreview.result.plan.steps.some((step) => step.kind === "importParWorkbook") && (
                                        <Text size="sm" c="dimmed">PAR evidence eligibility is verified from explicit import facts and Meta/hash provenance.</Text>
                                    )}
                                    {artifactPreview.result.plan.steps.filter((step) => step.kind === "importParWorkbook").flatMap((step) => step.losses ?? []).map((loss) => (
                                        <Text key={loss} size="sm" c="dimmed">PAR import boundary: {loss}</Text>
                                    ))}
                                    {artifactPreview.result.plan.preflight.losses.length > 0 && (
                                        <Text size="sm" c="dimmed">Data boundary: {artifactPreview.result.plan.preflight.losses.join(" ")}</Text>
                                    )}
                                </>
                            )}
                            {artifactPreview.status === "conflict" && <ErrorState message="This destination already contains files. Choose a different destination; Build will not overwrite it." />}
                        </div>
                    )}
                    {(artifactPreview.status === "unsupported" || artifactPreview.status === "error") && (
                        <>
                            <ErrorState message={artifactPreview.message} />
                            {artifactPreview.status === "unsupported" && (
                                <Text size="sm" c="dimmed" mt={4}>
                                    Planner diagnostic: {artifactPreview.plan.diagnostic?.message ?? "No executable conversion steps."}
                                </Text>
                            )}
                        </>
                    )}
                    <Button size="xs" mt="sm" onClick={() => onBuildArtifact(card.artifactTarget!)} loading={artifactBuildRun.status === "running"} disabled={!canBuildArtifact}>
                        Build
                    </Button>
                    {artifactBuildRun.status === "running" && (
                        <Button size="xs" mt="sm" ml="xs" color="red" variant="light" onClick={() => onCancelArtifactBuild(card.artifactTarget!)}>
                            Cancel
                        </Button>
                    )}
                    {(artifactBuildRun.status === "running" || artifactBuildRun.status === "ok") && artifactBuildRun.progress?.preflight !== undefined && (
                        <Text size="sm" c="dimmed" mt={4}>
                            {`Preflight: ${artifactBuildRun.progress.preflight.estimatedItemCount ?? "item count unavailable"} estimated item(s)` +
                                `${artifactBuildRun.progress.preflight.estimatedBytes !== undefined ? `, ${artifactBuildRun.progress.preflight.estimatedBytes} estimated bytes` : ""}` +
                                `${artifactBuildRun.progress.preflight.complexityWarning ? `. Warning: ${artifactBuildRun.progress.preflight.complexityWarning}` : ""}`}
                            {artifactBuildRun.status === "running" && artifactBuildRun.progress.status !== "preflight" && (
                                <>
                                    <br />
                                    {`Building artifact${artifactBuildRun.progress.message ? `: ${artifactBuildRun.progress.message}` : ""}` +
                                        `${artifactBuildRun.progress.completed !== undefined ? ` (${artifactBuildRun.progress.completed}${artifactBuildRun.progress.total !== undefined ? `/${artifactBuildRun.progress.total}` : ""})` : ""}`}
                                </>
                            )}
                            {artifactBuildRun.status === "running" && artifactBuildRun.cancellationRequested ? " Cancellation requested…" : ""}
                        </Text>
                    )}
                    {artifactBuildRun.status === "running" && artifactBuildRun.progress?.preflight === undefined && (
                        <Text size="sm" c="dimmed" mt={4}>
                            {artifactBuildRun.progress?.status !== "preflight" &&
                                (`Building artifact${artifactBuildRun.progress?.message ? `: ${artifactBuildRun.progress.message}` : ""}` +
                                    `${artifactBuildRun.progress?.completed !== undefined ? ` (${artifactBuildRun.progress.completed}${artifactBuildRun.progress.total !== undefined ? `/${artifactBuildRun.progress.total}` : ""})` : ""}`)}
                            {artifactBuildRun.cancellationRequested ? " Cancellation requested…" : ""}
                        </Text>
                    )}
                    {artifactBuildRun.status === "cancelled" && (
                        <Text size="sm" c="dimmed" mt={4}>
                            Build cancelled. No incomplete artifact was published.
                        </Text>
                    )}
                    {artifactBuildRun.status === "error" && <ErrorState message={artifactBuildRun.message} />}
                    {artifactBuildRun.status === "ok" && (
                        <>
                            <Text size="sm" mt={4}>
                                Built to {artifactBuildRun.result.outputPath}.
                                {artifactBuildRun.result.importedBlueprintPath !== undefined && ` Imported Blueprint: ${artifactBuildRun.result.importedBlueprintPath}.`}
                                {artifactBuildRun.result.conversionEvidencePath !== undefined && ` Conversion evidence: ${artifactBuildRun.result.conversionEvidencePath}.`}
                            </Text>
                            {artifactBuildRun.result.plan !== undefined && (
                                <Text size="sm" c="dimmed" mt={4}>
                                    Executed plan: {artifactBuildRun.result.plan.steps.map((step) => `${step.choice} ${step.kind}`).join(" → ") || "No executable steps"}.
                                </Text>
                            )}
                            {artifactBuildRun.result.stakeManifest !== undefined && (
                                <Text size="sm" c="dimmed" mt={4}>
                                    Stake manifest: {artifactBuildRun.result.stakeManifest.modes.map((mode) => `${mode.name} (cost ${mode.cost})`).join(", ") || "no modes"}. Files: {artifactBuildRun.result.stakeFiles?.join(", ") || "none"}.
                                </Text>
                            )}
                            {artifactBuildRun.result.preflight && (
                                <Text size="sm" c="dimmed" mt={4}>
                                    Published {artifactBuildRun.result.preflight.estimatedItemCount ?? "the estimated"} item(s)
                                    {artifactBuildRun.result.preflight.estimatedBytes !== undefined
                                        ? ` (estimated ${artifactBuildRun.result.preflight.estimatedBytes} bytes)`
                                        : ""}
                                    {artifactBuildRun.result.preflight.complexityWarning ? ` — ${artifactBuildRun.result.preflight.complexityWarning}` : ""}
                                </Text>
                            )}
                            <QuickActions>
                                <Button size="xs" variant="default" onClick={() => onOpenAsProject(artifactBuildRun.result.outputPath)}>
                                    Open as Project
                                </Button>
                                <Button size="xs" variant="default" onClick={() => onAddToProjects(artifactBuildRun.result.outputPath)} disabled={addedToProjects}>
                                    {addedToProjects ? "Added to Projects" : "Add to Projects"}
                                </Button>
                                {outputActionsUnavailable ? (
                                    <>
                                        <Button size="xs" variant="default" onClick={() => onCopyPath(artifactBuildRun.result.outputPath)}>
                                            Copy path
                                        </Button>
                                        <Text size="xs" c="dimmed">Opening local output is unsupported from a headless or remote Studio session.</Text>
                                    </>
                                ) : (
                                    <Button
                                        size="xs"
                                        variant="default"
                                        onClick={() =>
                                            artifactBuildRun.result.outputKind === "directory"
                                                ? onOpenFolder(artifactBuildRun.result.outputPath)
                                                : onRevealOutput(artifactBuildRun.result.outputPath)
                                        }
                                    >
                                        {artifactBuildRun.result.outputKind === "directory" ? "Open output folder" : "Reveal file"}
                                    </Button>
                                )}
                            </QuickActions>
                        </>
                    )}
                </>
            )}

            {card.kind === "remoteDeployment" && (
                <>
                    <Button
                        size="xs"
                        mt="sm"
                        loading={isActiveTarget && deployment.runLoading}
                        disabled={card.deploymentTarget === undefined}
                        onClick={() => {
                            if (card.deploymentTarget !== undefined) {
                                deployment.run(false, card.deploymentTarget);
                            }
                        }}
                    >
                        Check compatibility
                    </Button>
                    {previewedOk && (
                        <Button
                            size="xs"
                            mt="xs"
                            ml="xs"
                            loading={isActiveTarget && deployment.runLoading}
                            disabled={card.deploymentTarget === undefined}
                            onClick={() => deployment.run(true, card.deploymentTarget)}
                        >
                            Publish
                        </Button>
                    )}
                    {isActiveTarget && deployment.runError && <ErrorState message={describeProjectActionError("The remote deployment", deployment.runError)} />}
                    {isActiveTarget && deployment.runResult && !deployment.runLoading && (
                        deployment.runResult.ok ? (
                            <>
                                <Text size="sm" mt={4}>
                                    {deployment.runResult.publish
                                        ? `Published${deployment.runResult.delivered ? "." : " -- delivery could not be confirmed."}`
                                        : "Compatible -- ready to publish."}
                                </Text>
                                <PlannerSummary plan={deployment.runResult.plan} label="Deployment prerequisite plan" />
                            </>
                        ) : (
                            <>
                                {deployment.runResult.error !== undefined && <ErrorState message={deployment.runResult.error} />}
                                <PlannerSummary plan={deployment.runResult.plan} label="Deployment prerequisite plan" />
                                <IssueList title="Build issues" issues={deployment.runResult.stages.flatMap((stage) => stage.issues)} />
                            </>
                        )
                    )}
                </>
            )}

            <AdvancedDisclosure detail="technical information">
                <Text size="sm">
                    <Text span fw={600}>
                        Technical destination:
                    </Text>{" "}
                    {card.technicalDestination}
                </Text>
                <Text size="sm">
                    <Text span fw={600}>
                        Adapter:
                    </Text>{" "}
                    {card.adapter} (v{card.version})
                </Text>
                <Text size="sm" mt={4}>
                    <Text span fw={600}>
                        Write / publish behavior:
                    </Text>{" "}
                    {card.writePublishBehavior}
                </Text>
                {(artifactPreview.status === "ok" || artifactPreview.status === "conflict") && (
                    <>
                        <Text size="sm" mt={4}>
                            <Text span fw={600}>
                                Planned outputs:
                            </Text>{" "}
                            {artifactPreview.result.plannedOutputs.join("; ")}
                        </Text>
                        {artifactPreview.status === "conflict" && (
                            <Text size="sm" mt={4}>
                                <Text span fw={600}>
                                    Preflight detail:
                                </Text>{" "}
                                {artifactPreview.result.message}
                            </Text>
                        )}
                    </>
                )}
                {card.capabilities.length > 0 && (
                    <>
                        <Text size="sm" fw={600} mt={4}>
                            Capabilities
                        </Text>
                        <List size="sm" withPadding>
                            {card.capabilities.map((capability, index) => (
                                <List.Item key={index}>{capability}</List.Item>
                            ))}
                        </List>
                    </>
                )}
                {card.limits.length > 0 && (
                    <>
                        <Text size="sm" fw={600} mt={4}>
                            Limits
                        </Text>
                        <List size="sm" withPadding>
                            {card.limits.map((limit, index) => (
                                <List.Item key={index}>{limit}</List.Item>
                            ))}
                        </List>
                    </>
                )}
                <Text size="sm" mt={4}>
                    <Text span fw={600}>
                        Compatibility:
                    </Text>{" "}
                    {card.compatibility}
                </Text>
            </AdvancedDisclosure>
        </div>
    );
}

// The sole Studio Build/Export surface -- lists every applicable builder this project's own resolved
// capabilities offer (see describeExportDeployTargetCards's own doc comment), grouped by what it actually
// does, and runs it directly: outcome-library generation, Stake Engine Export, and every registered
// ExternalDeploymentTarget each execute through this tab's own Run/Build/Check&Publish action, sharing one
// status/error convention (ErrorState + a plain-language result line), rather than navigating away into a
// separate legacy Stepper-driven workflow first. Deployment's own selection/run/registry state is owned by
// the shared useDeploymentManager hook (see DeploymentManager) -- ExportDeployTab drives it directly
// (deployment.run(publish, target)) instead of reconstructing a prerequisite selector from registry or
// session state. The server owns the selected deployment request and returns its planner terminal result.
// Every adapter card's own action always checks compatibility
// first (publish:false) and only offers "Publish" once that check comes back clean -- never a first-click
// auto-publish outside this machine. (The SDK's own
// local-json-example demo target -- the one case that could ever run straight to publish:true without a
// preview step -- is never described as a card at all here; see ExportDeployTargets.ts's own doc comment.)
export function ExportDeployTab({capabilities: _capabilities, deployment}: {capabilities: readonly StudioProjectCapability[]; deployment: DeploymentManager}) {
    const fetchImpl = useStudioApi();
    const openAndNavigate = useOpenProject();
    const deploymentTargets = deployment.targetsView.status === "loaded" ? deployment.targetsView.targets : [];
    const defaultModeName = resolveDefaultModeName(deployment.projectModesView);

    const [outcomeLibraryRun, setOutcomeLibraryRun] = useState<OutcomeLibraryRunView>({status: "idle"});
    const outcomeLibraryGuard = useDoubleSubmitGuard();
    const outcomeLibraryPollTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    useEffect(() => () => {
        if (outcomeLibraryPollTimer.current !== undefined) clearTimeout(outcomeLibraryPollTimer.current);
    }, []);
    const [outcomeLibraryGenerationOptions, setOutcomeLibraryGenerationOptions] = useState<OutcomeLibraryGenerationOptions>({
        mode: "",
        stake: "",
        libraryId: "",
        configHash: "",
        outDir: "outcomelibrary",
        // A successful preflight fills these from the domain-owned policy.
        maxOutcomeSpaceSize: "",
        generation: "default",
        sampleSize: "",
        seed: "",
    });
    const [outcomeLibraryPreflight, setOutcomeLibraryPreflight] = useState<OutcomeLibraryPreflightView>({status: "loading"});
    // A cancellation checkpoint is server-persisted. Rehydrate it after a browser
    // reload so recovery never depends on an in-memory React state or a job id
    // copied by the user before refreshing the page.
    useEffect(() => {
        let cancelled = false;
        listOutcomeLibraryGenerationJobs(fetchImpl)
            .then((jobs) => {
                if (cancelled) return;
                const resumable = jobs.find((job) => job.status === "cancelled" && job.result?.status === "cancelled" && job.result.checkpoint !== undefined);
                if (resumable?.result?.status === "cancelled") setOutcomeLibraryRun({status: "cancelled", result: resumable.result});
            })
            .catch(() => {
                // Older Studio servers do not expose checkpoint discovery; the
                // bound preflight remains the authoritative execution gate.
            });
        return () => {
            cancelled = true;
        };
    }, [fetchImpl]);
    useEffect(() => {
        let cancelled = false;
        const generation = outcomeLibraryGenerationOptions.generation;
        // Do not turn an unset input into an invalid empty decimal.  This first
        // request is how a fresh Studio form receives the domain defaults.
        setOutcomeLibraryPreflight({status: "loading"});
        estimateOutcomeLibraryGeneration(fetchImpl, {
            mode: outcomeLibraryGenerationOptions.mode.trim() || defaultModeName,
            ...(outcomeLibraryGenerationOptions.stake.trim() === "" ? {} : {stake: Number(outcomeLibraryGenerationOptions.stake)}),
            ...(outcomeLibraryGenerationOptions.libraryId.trim() === "" ? {} : {libraryId: outcomeLibraryGenerationOptions.libraryId.trim()}),
            ...(outcomeLibraryGenerationOptions.configHash.trim() === "" ? {} : {configHash: outcomeLibraryGenerationOptions.configHash.trim()}),
            ...(outcomeLibraryGenerationOptions.outDir.trim() === "" || outcomeLibraryGenerationOptions.outDir.trim() === "outcomelibrary" ? {} : {outDir: outcomeLibraryGenerationOptions.outDir.trim()}),
            generation,
            ...(outcomeLibraryGenerationOptions.maxOutcomeSpaceSize.trim() === "" ? {} : {maxOutcomeSpaceSize: outcomeLibraryGenerationOptions.maxOutcomeSpaceSize}),
            ...(generation === "sampled" || generation === "bounded" ? {sample: {sampleSize: outcomeLibraryGenerationOptions.sampleSize, seed: outcomeLibraryGenerationOptions.seed}} : {}),
        })
            .then((result) => {
                if (cancelled) return;
                setOutcomeLibraryPreflight(result.status === "ok" ? {status: "ok", result} : {status: "error", result});
                if (result.status === "ok" && result.defaults !== undefined) {
                    // Never overwrite an explicit choice with a later preflight.
                    setOutcomeLibraryGenerationOptions((current) => {
                        const maxOutcomeSpaceSize = current.maxOutcomeSpaceSize || String(result.defaults.maxExactOutcomeSpaceSize);
                        const sampleSize = current.sampleSize || String(result.defaults.boundedSample.sampleSize);
                        const seed = current.seed || result.defaults.boundedSample.seed;
                        if (maxOutcomeSpaceSize === current.maxOutcomeSpaceSize && sampleSize === current.sampleSize && seed === current.seed) return current;
                        return {...current, maxOutcomeSpaceSize, sampleSize, seed};
                    });
                }
            })
            .catch((error: unknown) => {
                if (!cancelled) setOutcomeLibraryPreflight({status: "error", message: describeProjectActionError("The outcome library preflight", errorMessage(error))});
            });
        return () => {
            cancelled = true;
        };
    }, [defaultModeName, fetchImpl, outcomeLibraryGenerationOptions]);

    // The "Build artifact" group's own target list -- see StudioArtifactBuildService.listTargets's own
    // doc comment. Fetched once on mount: it depends only on the active project's own resolved ProjectType,
    // which is fixed for the lifetime of this tab (switching projects remounts the whole Project Dashboard).
    const [artifactTargets, setArtifactTargets] = useState<readonly StudioArtifactTargetView[]>([]);
    const [artifactTargetsError, setArtifactTargetsError] = useState<string>();
    useEffect(() => {
        let cancelled = false;
        listArtifactTargets(fetchImpl)
            .then((targets) => {
                if (!cancelled) {
                    setArtifactTargets(targets);
                }
            })
            .catch((error: unknown) => {
                if (!cancelled) {
                    setArtifactTargetsError(describeProjectActionError("The build artifact target list", errorMessage(error)));
                }
            });
        return () => {
            cancelled = true;
        };
    }, [fetchImpl]);
    const artifactCards = describeArtifactBuildTargetCards(artifactTargets);
    const cards = [...describeExportDeployTargetCards(deploymentTargets, artifactTargets), ...artifactCards];

    // One registry-backed preview per supported artifactTarget (keyed by StudioArtifactTargetType), fetched
    // automatically as soon as artifactTargets reports it supported -- see ArtifactPreviewRunView's own doc
    // comment for why this runs unprompted rather than behind its own button: the resolved
    // destination/conflict this reports must already be on screen before Build is ever clicked, not only
    // once a build attempt itself hits it.
    const [artifactPreviews, setArtifactPreviews] = useState<Record<string, ArtifactPreviewRunView>>({});
    const [artifactDestinations, setArtifactDestinations] = useState<Record<string, string>>({});
    useEffect(() => {
        let cancelled = false;
        const supportedTargets = artifactTargets.filter((entry) => entry.supported).map((entry) => entry.target);
        supportedTargets.forEach((target) => {
            setArtifactPreviews((previews) => ({...previews, [target]: {status: "loading"}}));
            previewArtifact(fetchImpl, target, artifactDestinations[target]?.trim() || undefined)
                .then((view) => {
                    if (!cancelled) {
                        setArtifactPreviews((previews) => ({...previews, [target]: toArtifactPreviewRunView(view)}));
                    }
                })
                .catch((error: unknown) => {
                    if (!cancelled) {
                        setArtifactPreviews((previews) => ({
                            ...previews,
                            [target]: {status: "error", message: describeProjectActionError("The build destination preview", errorMessage(error))},
                        }));
                    }
                });
        });
        return () => {
            cancelled = true;
        };
    }, [artifactTargets, artifactDestinations, fetchImpl]);

    // One run per artifactTarget (keyed by StudioArtifactTargetType), each independent of every other --
    // see ArtifactBuildRunView's own doc comment.
    const [artifactBuildRuns, setArtifactBuildRuns] = useState<Record<string, ArtifactBuildRunView>>({});
    const artifactBuildPollTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
    useEffect(() => () => {
        Object.values(artifactBuildPollTimers.current).forEach((timer) => clearTimeout(timer));
    }, []);
    // Every outputPath a successful build's own "Add to Projects" has already registered this session --
    // keyed by outputPath (not target), since a rebuild against a different outDir is a different
    // registration candidate even for the same target.
    const [addedToProjectPaths, setAddedToProjectPaths] = useState<ReadonlySet<string>>(new Set());
    const [artifactActionError, setArtifactActionError] = useState<string>();

    const [openFolderError, setOpenFolderError] = useState<string>();
    const [outputActionsUnavailable, setOutputActionsUnavailable] = useState(false);

    useEffect(() => {
        let cancelled = false;
        checkNativePickerAvailability(fetchImpl)
            .then((view) => {
                if (!cancelled) {
                    setOutputActionsUnavailable(view.status === "unavailable");
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setOutputActionsUnavailable(true);
                }
            });
        return () => {
            cancelled = true;
        };
    }, [fetchImpl]);

    function handleOpenFolder(path: string): void {
        setOpenFolderError(undefined);
        openOutputFolder(fetchImpl, path)
            .then((view) => {
                if (view.status === "unavailable") {
                    setOpenFolderError(view.reason);
                    setOutputActionsUnavailable(true);
                } else if (view.status === "error") {
                    setOpenFolderError(view.message);
                }
            })
            .catch((error: unknown) => setOpenFolderError(errorMessage(error)));
    }

    function handleRevealOutput(path: string): void {
        setOpenFolderError(undefined);
        revealOutputPath(fetchImpl, path)
            .then((view) => {
                if (view.status === "unavailable") {
                    setOpenFolderError(view.reason);
                    setOutputActionsUnavailable(true);
                } else if (view.status === "error") {
                    setOpenFolderError(view.message);
                }
            })
            .catch((error: unknown) => setOpenFolderError(errorMessage(error)));
    }

    function copyOutputPath(path: string): void {
        if (navigator.clipboard !== undefined) {
            navigator.clipboard.writeText(path).catch(() => setOpenFolderError("Couldn't copy the output path. Select and copy it from the build result instead."));
            return;
        }
        setOpenFolderError("Clipboard access is unavailable. Select and copy the output path from the build result instead.");
    }

    function handleGenerateOutcomeLibrary(): void {
        // Execution is deliberately impossible without the precise successful
        // snapshot shown above; the server independently enforces this token.
        if (outcomeLibraryPreflight.status !== "ok") return;
        if (!outcomeLibraryGuard.begin()) {
            return;
        }
        startOutcomeLibraryGeneration(fetchImpl, {
            mode: outcomeLibraryGenerationOptions.mode.trim() || defaultModeName,
            generation: outcomeLibraryGenerationOptions.generation,
            ...(outcomeLibraryGenerationOptions.maxOutcomeSpaceSize.trim() === "" ? {} : {maxOutcomeSpaceSize: outcomeLibraryGenerationOptions.maxOutcomeSpaceSize}),
            ...(outcomeLibraryGenerationOptions.stake.trim() === "" ? {} : {stake: Number(outcomeLibraryGenerationOptions.stake)}),
            ...(outcomeLibraryGenerationOptions.libraryId.trim() === "" ? {} : {libraryId: outcomeLibraryGenerationOptions.libraryId.trim()}),
            ...(outcomeLibraryGenerationOptions.configHash.trim() === "" ? {} : {configHash: outcomeLibraryGenerationOptions.configHash.trim()}),
            ...(outcomeLibraryGenerationOptions.outDir.trim() === "" || outcomeLibraryGenerationOptions.outDir.trim() === "outcomelibrary" ? {} : {outDir: outcomeLibraryGenerationOptions.outDir.trim()}),
            ...(outcomeLibraryGenerationOptions.generation === "sampled" || outcomeLibraryGenerationOptions.generation === "bounded"
                ? {sample: {sampleSize: outcomeLibraryGenerationOptions.sampleSize, seed: outcomeLibraryGenerationOptions.seed}}
                : {}),
            preflightToken: outcomeLibraryPreflight.result.preflightToken,
        })
            .then((job) => {
                setOutcomeLibraryRun({status: "running", job});
                pollOutcomeLibraryGeneration(job.id);
            })
            .catch((error: unknown) => {
                outcomeLibraryGuard.end();
                setOutcomeLibraryRun({status: "error", message: error instanceof OutcomeLibraryGenerationStartError
                    // The retained direct/job start routes can reject an
                    // automatic preflight before a job exists.  Preserve the
                    // server's classified preflight status here so this path
                    // has the same recovery as a terminal lifecycle result.
                    ? describeOutcomeLibraryGenerationTerminalOutcome({status: error.outcomeStatus})
                    : describeProjectActionError("The outcome library generation", errorMessage(error)),
                ...(error instanceof OutcomeLibraryGenerationStartError ? {diagnostic: error.message} : {})});
            });
    }

    function pollOutcomeLibraryGeneration(id: string): void {
        getOutcomeLibraryGenerationJob(fetchImpl, id)
            .then((job) => {
                if (job.status === "queued" || job.status === "running") {
                    setOutcomeLibraryRun({status: "running", job});
                    outcomeLibraryPollTimer.current = setTimeout(() => pollOutcomeLibraryGeneration(id), 250);
                    return;
                }
                outcomeLibraryGuard.end();
                if (job.status === "completed" && job.result?.status === "ok") {
                    setOutcomeLibraryRun({status: "ok", result: job.result});
                    deployment.refreshProjectModes();
                } else if (job.status === "cancelled" && job.result?.status === "cancelled") {
                    setOutcomeLibraryRun({status: "cancelled", result: job.result});
                } else if (job.result !== undefined && job.result.status !== "ok") {
                    setOutcomeLibraryRun({status: "error", message: describeGenerateResultError(job.result), ...("error" in job.result ? {diagnostic: job.result.error} : {}), plan: job.result.plan});
                } else {
                    setOutcomeLibraryRun({status: "error", message: "Outcome library generation ended without a result."});
                }
            })
            .catch((error: unknown) => {
                outcomeLibraryGuard.end();
                setOutcomeLibraryRun({status: "error", message: describeProjectActionError("The outcome library generation", errorMessage(error))});
            });
    }

    function handleCancelOutcomeLibrary(): void {
        if (outcomeLibraryRun.status !== "running") return;
        cancelOutcomeLibraryGeneration(fetchImpl, outcomeLibraryRun.job.id)
            .then((job) => setOutcomeLibraryRun({status: "running", job}))
            .catch((error: unknown) => setOutcomeLibraryRun({status: "error", message: describeProjectActionError("Cancelling the outcome library generation", errorMessage(error))}));
    }

    function handleResumeOutcomeLibrary(): void {
        if (outcomeLibraryRun.status !== "cancelled" || outcomeLibraryRun.result.checkpoint === undefined) return;
        if (!outcomeLibraryGuard.begin()) return;
        resumeOutcomeLibraryGeneration(fetchImpl, outcomeLibraryRun.result.checkpoint.id)
            .then((job) => {
                setOutcomeLibraryRun({status: "running", job});
                pollOutcomeLibraryGeneration(job.id);
            })
            .catch((error: unknown) => {
                outcomeLibraryGuard.end();
                // A resume can be rejected before a new job exists (most
                // commonly because another generation owns the bound
                // destination).  Render the server-owned Outcome Library
                // classification and its actionable diagnostic just like a
                // fresh lifecycle start instead of generic project-action
                // copy.
                setOutcomeLibraryRun({status: "error", message: error instanceof OutcomeLibraryGenerationStartError
                    ? describeOutcomeLibraryGenerationTerminalOutcome({status: error.outcomeStatus})
                    : describeProjectActionError("Resuming the outcome library generation", errorMessage(error)),
                ...(error instanceof OutcomeLibraryGenerationStartError ? {diagnostic: error.message} : {})});
            });
    }

    // Runs a single "Build artifact" card's own target through ArtifactBuilderRegistry (via
    // /api/project/artifacts/build) -- see StudioArtifactBuildService.build's own doc comment for exactly
    // what this does and doesn't promise. Guarded by this target's own current run status (rather than a
    // shared useDoubleSubmitGuard) since every target's own build runs fully independently of every other.
    function handleBuildArtifact(target: StudioArtifactTargetType): void {
        if (artifactBuildRuns[target]?.status === "running") {
            return;
        }
        const preview = artifactPreviews[target];
        const preparedOperationId = preview?.status === "ok" ? preview.result.preparedOperationId : undefined;
        startArtifactBuild(fetchImpl, target, artifactDestinations[target]?.trim() || undefined, preparedOperationId)
            .then((job) => {
                setArtifactBuildRuns((runs) => ({...runs, [target]: {status: "running", jobId: job.id, progress: job.progress, cancellationRequested: false}}));
                pollArtifactBuild(target, job.id);
            })
            .catch((error: unknown) => setArtifactBuildRuns((runs) => ({
                ...runs,
                [target]: {status: "error", message: describeProjectActionError("The artifact build", errorMessage(error))},
            })));
    }

    function handleCancelArtifactBuild(target: StudioArtifactTargetType): void {
        const run = artifactBuildRuns[target];
        if (run?.status !== "running") return;
        setArtifactBuildRuns((runs) => ({...runs, [target]: {...run, cancellationRequested: true}}));
        cancelArtifactBuild(fetchImpl, run.jobId)
            .then(() => pollArtifactBuild(target, run.jobId))
            .catch((error: unknown) => setArtifactBuildRuns((runs) => ({
                ...runs,
                [target]: {status: "error", message: describeProjectActionError("The artifact build cancellation", errorMessage(error))},
            })));
    }

    function pollArtifactBuild(target: StudioArtifactTargetType, jobId: string): void {
        getArtifactBuild(fetchImpl, jobId)
            .then((job) => {
                if (job.status === "queued" || job.status === "running") {
                    setArtifactBuildRuns((runs) => ({...runs, [target]: {status: "running", jobId, progress: job.progress, cancellationRequested: job.cancellationRequested}}));
                    artifactBuildPollTimers.current[target] = setTimeout(() => pollArtifactBuild(target, jobId), 100);
                    return;
                }
                Reflect.deleteProperty(artifactBuildPollTimers.current, target);
                if (job.status === "cancelled" && job.result?.status === "cancelled") {
                    // The terminal response is authoritative.  Do not turn a
                    // cancelled job into a client-side capability decision.
                    setArtifactBuildRuns((runs) => ({...runs, [target]: {status: "cancelled", plan: job.result!.plan}}));
                } else if (job.result !== undefined && job.result.status === "ok") {
                    const result = job.result;
                    setArtifactBuildRuns((runs) => ({
                        ...runs,
                        [target]: {
                            status: "ok",
                            result,
                            progress: runs[target]?.status === "running" ? runs[target].progress : undefined,
                        },
                    }));
                } else {
                    const result = job.result;
                    setArtifactBuildRuns((runs) => ({
                        ...runs,
                        [target]: {
                            status: "error",
                            message: result !== undefined ? describeArtifactBuildResultError(result) : "Artifact build ended without a result.",
                            ...(result !== undefined ? {plan: result.plan} : {}),
                        },
                    }));
                }
            })
            .catch((error: unknown) => setArtifactBuildRuns((runs) => ({
                ...runs,
                [target]: {status: "error", message: describeProjectActionError("The artifact build", errorMessage(error))},
            })));
    }

    // A successful build's own output is itself a resolvable PokieProject (of the built target's own
    // type) -- "Open as Project" navigates Studio straight into it, the same one explicit Home -> Project
    // transition every other "Open in Studio"/"Open as Project" action in Studio already uses (see
    // useOpenProject's own doc comment). This is this card's own "run/inspect follow-up": once open, the
    // new project's own Play/Replay/Validate tabs are immediately reachable.
    function handleOpenArtifactAsProject(projectRoot: string): void {
        setArtifactActionError(undefined);
        openAndNavigate(projectRoot).catch((error: unknown) => setArtifactActionError(errorMessage(error)));
    }

    // Registers the build's own output in Studio's persistent Projects registry, so it shows up in Home's
    // Projects panel even after this session ends -- the "Projects visibility" half of this card's own
    // follow-up, alongside "Open as Project" above and "Open output folder" (handleOpenFolder) shared with
    // every other card on this page.
    function handleAddArtifactToProjects(projectRoot: string): void {
        setArtifactActionError(undefined);
        registerProjectImport(fetchImpl, projectRoot)
            .then(() => setAddedToProjectPaths((prev) => new Set(prev).add(projectRoot)))
            .catch((error: unknown) => setArtifactActionError(errorMessage(error)));
    }

    return (
        <div>
            <Text size="sm" c="dimmed" mb="sm">
                Build game outputs, export a bundle, or deliver it to a configured destination. Each option
                shows what it needs and what happens next; details about the underlying integration are
                available when you need them.
            </Text>
            <QuickActions>
                <Button variant="default" size="xs" onClick={deployment.refreshTargets}>
                    Refresh registered targets
                </Button>
            </QuickActions>
            {deployment.targetsView.status === "loading" && <LoadingState label="Loading registered deployment targets…" />}
            {deployment.targetsError && <ErrorState message={describeProjectActionError("The deployment targets list", deployment.targetsError)} />}
            {openFolderError && <ErrorState message={openFolderError} />}
            {artifactTargetsError && <ErrorState message={artifactTargetsError} />}
            {artifactActionError && <ErrorState message={artifactActionError} />}

            {cards.length === 0 ? (
                <EmptyState message="This project can't be built or exported from Studio -- see the current project's own capabilities." />
            ) : (
                GROUP_ORDER.map((kind) => {
                    const groupCards = cards.filter((card) => card.kind === kind);
                    return (
                        <PageSection key={kind} legend={GROUP_LABELS[kind].legend}>
                            <Text size="sm" c="dimmed" mb="sm">
                                {GROUP_LABELS[kind].blurb}
                            </Text>
                            {groupCards.length === 0 ? (
                                <EmptyState message="Nothing in this group yet." />
                            ) : (
                                groupCards.map((card) => {
                                    const artifactBuildRun: ArtifactBuildRunView =
                                        (card.artifactTarget !== undefined ? artifactBuildRuns[card.artifactTarget] : undefined) ?? {status: "idle"};
                                    const artifactPreview: ArtifactPreviewRunView =
                                        (card.artifactTarget !== undefined ? artifactPreviews[card.artifactTarget] : undefined) ?? {status: "loading"};
                                    const addedToProjects = artifactBuildRun.status === "ok" && addedToProjectPaths.has(artifactBuildRun.result.outputPath);
                                    return (
                                        <TargetCard
                                            key={card.id}
                                            card={card}
                                            defaultModeName={defaultModeName}
                                            outcomeLibraryRun={outcomeLibraryRun}
                                            outcomeLibraryPreflight={outcomeLibraryPreflight}
                                            onGenerateOutcomeLibrary={handleGenerateOutcomeLibrary}
                                            onCancelOutcomeLibrary={handleCancelOutcomeLibrary}
                                            onResumeOutcomeLibrary={handleResumeOutcomeLibrary}
                                            outcomeLibraryGenerationOptions={outcomeLibraryGenerationOptions}
                                            onOutcomeLibraryGenerationOptionsChange={setOutcomeLibraryGenerationOptions}
                                            deployment={deployment}
                                            onOpenFolder={handleOpenFolder}
                                            artifactPreview={artifactPreview}
                                            artifactBuildRun={artifactBuildRun}
                                            onBuildArtifact={handleBuildArtifact}
                                            onCancelArtifactBuild={handleCancelArtifactBuild}
                                            artifactDestination={card.artifactTarget === undefined ? "" : artifactDestinations[card.artifactTarget] ?? ""}
                                            onArtifactDestinationChange={(target, destination) =>
                                                setArtifactDestinations((destinations) => ({...destinations, [target]: destination}))
                                            }
                                            onOpenAsProject={handleOpenArtifactAsProject}
                                            onAddToProjects={handleAddArtifactToProjects}
                                            addedToProjects={addedToProjects}
                                            onRevealOutput={handleRevealOutput}
                                            outputActionsUnavailable={outputActionsUnavailable}
                                            onCopyPath={copyOutputPath}
                                        />
                                    );
                                })
                            )}
                        </PageSection>
                    );
                })
            )}
        </div>
    );
}
