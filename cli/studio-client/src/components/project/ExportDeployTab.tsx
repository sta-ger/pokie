import {useEffect, useRef, useState} from "react";
import {Badge, Button, Group, List, Text} from "@mantine/core";
import {
    cancelArtifactBuild,
    checkNativePickerAvailability,
    exportStakeEngine,
    generateOutcomeLibrary,
    getArtifactBuild,
    listArtifactTargets,
    openOutputFolder,
    previewArtifact,
    revealOutputPath,
    registerProjectImport,
    startArtifactBuild,
} from "../../api/apiClient";
import type {
    OutcomeLibrarySelector,
    StudioArtifactBuildView,
    StudioArtifactBuildJobView,
    StudioArtifactPreviewView,
    StudioArtifactTargetType,
    StudioArtifactTargetView,
    StudioDeploymentModeInput,
    StudioOutcomeLibraryGenerateResultView,
    StudioProjectCapability,
    StudioStakeEngineExportView,
} from "../../api/types";
import {useStudioApi} from "../../context/StudioApiProvider";
import {
    describeArtifactBuildTargetCards,
    describeExportDeployTargetCards,
    type ExportDeployTargetCard,
    type ExportDeployTargetKind,
} from "../../domain/interpret/ExportDeployTargets";
import {errorMessage} from "../../domain/errorMessage";
import {describePathActionError} from "../../domain/pathActionError";
import {describeProjectActionError} from "../../domain/projectActionError";
import type {DeploymentManager} from "../../hooks/useDeploymentManager";
import {useDoubleSubmitGuard} from "../../hooks/useDoubleSubmitGuard";
import {useOpenProject} from "../../hooks/useOpenProject";
import {EmptyState} from "../common/EmptyState";
import {ErrorState} from "../common/ErrorState";
import {IssueList} from "../common/IssueList";
import {LoadingState} from "../common/LoadingState";
import {PageSection} from "../common/PageSection";
import {QuickActions} from "../common/QuickActions";
import {RecoveryNotice} from "../common/RecoveryNotice";
import {PathInput} from "../common/PathInput";

const GROUP_LABELS: Record<ExportDeployTargetKind, {legend: string; blurb: string}> = {
    outcomeLibrary: {
        legend: "Outcome libraries",
        blurb: "Generates or selects the canonical outcome library every other builder below reads from -- a build step in its own right, not a delivery target.",
    },
    staticExport: {
        legend: "Static export",
        blurb: "Writes a standalone, self-contained bundle to disk -- nothing is registered, nothing runs a delivery step.",
    },
    buildArtifact: {
        legend: "Build artifact",
        blurb:
            'Runs this project through pokie\'s own ArtifactBuilderRegistry -- the exact "pokie build <project> --target <target>" conversions the CLI itself offers, only ever listing a target this project\'s own resolved type actually supports.',
    },
    remoteDeployment: {
        legend: "Remote deployment",
        blurb: "A registered External Adapter SDK target, checked for compatibility before Publish is ever offered -- the SDK's own local-json-example demo target is deliberately never listed here (see ExportDeployTargets.ts's own doc comment); register a real target to replace this group's placeholder.",
    },
};

const GROUP_ORDER: readonly ExportDeployTargetKind[] = ["outcomeLibrary", "staticExport", "buildArtifact", "remoteDeployment"];

// Every "Configure"/etc-free run below runs against this single project-wide mode name -- the project's
// own first current build mode when known, "base" (the same fallback generateOutcomeLibrary's own
// server-side request validator already applies) otherwise. Build/Export is deliberately a single-mode,
// zero-configuration surface -- this is the sole Studio build surface now (see ProjectDashboardPage.tsx's
// own doc comment on the legacy Deployment/Stake Engine Export/Outcome Libraries routes), so a project
// that genuinely needs a multi-mode bundle has no separate dedicated workflow to fall back to yet.
function resolveDefaultModeName(projectModesView: DeploymentManager["projectModesView"]): string {
    return projectModesView.status === "ok" && projectModesView.modeIds.length > 0 ? projectModesView.modeIds[0] : "base";
}

const STAKE_ENGINE_DEFAULT_OUT_DIR = "stakeengine";

type OutcomeLibraryRunView =
    | {status: "idle"}
    | {status: "running"}
    | {status: "ok"; result: Extract<StudioOutcomeLibraryGenerateResultView, {status: "ok"}>}
    | {status: "error"; message: string};

type StaticExportRunView =
    | {status: "idle"}
    | {status: "running"}
    | {status: "ok"; result: Extract<StudioStakeEngineExportView, {status: "ok"}>}
    // `source` is the exact resolved mode/library selector the conflicting request was submitted with --
    // Overwrite resubmits that same pairing (never re-resolves it), so an Outcome Libraries change made
    // while the conflict is on screen can never make Overwrite silently write a different library than
    // what the conflict itself was reported against.
    | {status: "conflict"; result: Extract<StudioStakeEngineExportView, {status: "conflict"}>; source: Extract<OutcomeLibrarySelector, {kind: "bundle"}>}
    | {status: "error"; message: string};

function describeGenerateResultError(view: Exclude<StudioOutcomeLibraryGenerateResultView, {status: "ok"}>): string {
    if (view.status === "load-error") {
        return describePathActionError("The outcome library generation", view.error);
    }
    if (view.status === "invalid") {
        const [firstError] = view.errors;
        return firstError?.message ?? "The outcome library bundle failed validation.";
    }
    return view.error;
}

// Never called for a "conflict" result -- that status renders its own recovery UI (Overwrite when
// `overwritable`, otherwise its own already-actionable `error` message) directly in TargetCard below.
function describeStakeEngineResultError(view: Exclude<StudioStakeEngineExportView, {status: "ok"} | {status: "conflict"}>): string {
    if (view.status === "load-error") {
        return describePathActionError("The Stake Engine export's outcome library", view.error);
    }
    const [firstError] = view.errors;
    return firstError?.message ?? "The Stake Engine export failed validation.";
}

// One entry per "buildArtifact" card, keyed by its own artifactTarget -- each target runs (and reports)
// independently of every other, same "own status per card" convention outcomeLibraryRun/staticExportRun
// already use for their own single card.
type ArtifactBuildRunView =
    | {status: "idle"}
    | {status: "running"; jobId: string; progress?: StudioArtifactBuildJobView["progress"]; cancellationRequested: boolean}
    | {status: "ok"; result: Extract<StudioArtifactBuildView, {status: "ok"}>}
    | {status: "cancelled"}
    | {status: "error"; message: string};

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
    | {status: "unsupported"; message: string}
    | {status: "conflict"; result: Extract<StudioArtifactPreviewView, {status: "conflict"}>}
    | {status: "error"; message: string};

function toArtifactPreviewRunView(view: StudioArtifactPreviewView): ArtifactPreviewRunView {
    if (view.status === "ok") {
        return {status: "ok", result: view};
    }
    if (view.status === "conflict") {
        return {status: "conflict", result: view};
    }
    return {status: view.status === "unsupported" ? "unsupported" : "error", message: view.message};
}

function TargetCard({
    card,
    defaultModeName,
    outcomeLibraryRun,
    onGenerateOutcomeLibrary,
    resolveOutcomeLibrarySource,
    resolveDeploymentModes,
    staticExportRun,
    onRunStaticExport,
    onOverwriteStaticExport,
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
    onGenerateOutcomeLibrary: () => void;
    resolveOutcomeLibrarySource: () => Extract<OutcomeLibrarySelector, {kind: "bundle"}> | undefined;
    resolveDeploymentModes: () => StudioDeploymentModeInput[] | undefined;
    staticExportRun: StaticExportRunView;
    onRunStaticExport: () => void;
    onOverwriteStaticExport: () => void;
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
    const staticExportSource = resolveOutcomeLibrarySource();
    const canRunStaticExport = staticExportSource !== undefined;
    const staticExportModeName = staticExportSource?.modeName ?? defaultModeName;
    const previewedOk = isActiveTarget && deployment.runResult?.ok === true && deployment.runResult.publish === false;

    return (
        <div style={{marginBottom: "1rem", paddingBottom: "1rem", borderBottom: "1px solid var(--mantine-color-default-border)"}}>
            <Group gap="xs" mb={4}>
                <Text fw={600}>{card.label}</Text>
                <Badge size="sm" color={card.locality === "local" ? "blue" : "grape"} variant="light">
                    {card.locality}
                </Badge>
            </Group>
            <Text size="sm">
                <Text span fw={600}>
                    Adapter:
                </Text>{" "}
                {card.adapter} (v{card.version})
            </Text>
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
            <Text size="sm" mt={4}>
                <Text span fw={600}>
                    Write / publish behavior:
                </Text>{" "}
                {card.writePublishBehavior}
            </Text>
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
            <Text size="sm" mt={4}>
                <Text span fw={600}>
                    Compatibility:
                </Text>{" "}
                {card.compatibility}
            </Text>

            {card.kind === "outcomeLibrary" && (
                <>
                    <Button size="xs" mt="sm" onClick={onGenerateOutcomeLibrary} loading={outcomeLibraryRun.status === "running"}>
                        Generate outcome library ({defaultModeName})
                    </Button>
                    {outcomeLibraryRun.status === "error" && <ErrorState message={outcomeLibraryRun.message} />}
                    {outcomeLibraryRun.status === "ok" && (
                        <Text size="sm" mt={4}>
                            Generated {outcomeLibraryRun.result.mode.outcomeCount.toLocaleString()} outcomes for mode &quot;
                            {outcomeLibraryRun.result.mode.modeName}&quot; (RTP {(outcomeLibraryRun.result.mode.rtp * 100).toFixed(2)}%) into{" "}
                            {outcomeLibraryRun.result.bundleDir}.{" "}
                            <Button size="xs" variant="default" onClick={() => onOpenFolder(outcomeLibraryRun.result.bundleDir)}>
                                Open output folder
                            </Button>
                        </Text>
                    )}
                </>
            )}

            {card.kind === "staticExport" && (
                <>
                    <Button size="xs" mt="sm" onClick={onRunStaticExport} loading={staticExportRun.status === "running"} disabled={!canRunStaticExport}>
                        Run Stake Engine Export ({staticExportModeName})
                    </Button>
                    {!canRunStaticExport && staticExportRun.status !== "ok" && staticExportRun.status !== "conflict" && (
                        <EmptyState message="Generate an outcome library above first -- Stake Engine Export always reads the canonical one this project's own registry currently reports." />
                    )}
                    {staticExportRun.status === "error" && <ErrorState message={staticExportRun.message} />}
                    {staticExportRun.status === "conflict" &&
                        (staticExportRun.result.overwritable ? (
                            <RecoveryNotice
                                title={staticExportRun.result.error}
                                message="Exporting will replace the existing directory's contents."
                                actionLabel="Overwrite"
                                actionColor="red"
                                onAction={onOverwriteStaticExport}
                            />
                        ) : (
                            <ErrorState message={staticExportRun.result.error} />
                        ))}
                    {staticExportRun.status === "ok" && (
                        <Text size="sm" mt={4}>
                            Exported {staticExportRun.result.files.length} file(s) to {staticExportRun.result.outDir}.{" "}
                            <Button size="xs" variant="default" onClick={() => onOpenFolder(staticExportRun.result.outDir)}>
                                Open output folder
                            </Button>
                        </Text>
                    )}
                </>
            )}

            {card.kind === "buildArtifact" && card.artifactTarget && (
                <>
                    <PathInput
                        label={card.artifactTarget === "parWorkbook" ? "Output file (optional)" : "Output directory (optional)"}
                        description="Choose a destination with your host picker, or type a server-filesystem path when Studio is headless or remote. Leave blank to use the shown default."
                        kind={card.artifactTarget === "parWorkbook" ? "file" : "directory"}
                        filePickerMode={card.artifactTarget === "parWorkbook" ? "save" : "open"}
                        fileFilters={card.artifactTarget === "parWorkbook" ? [{name: "Excel workbooks", extensions: ["xlsx"]}] : undefined}
                        browseTitle={card.artifactTarget === "parWorkbook" ? "Choose a PAR workbook destination" : "Choose an artifact output directory"}
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
                            <Text size="sm">Output type: {artifactPreview.result.destinationKind}</Text>
                            <Text size="sm">Conflict state: {artifactPreview.status === "ok" ? "Available" : "Conflict — build will not overwrite it"}</Text>
                            <Text size="sm">Planned outputs: {artifactPreview.result.plannedOutputs.join("; ")}</Text>
                            {artifactPreview.status === "conflict" && <ErrorState message={artifactPreview.result.message} />}
                        </div>
                    )}
                    {(artifactPreview.status === "unsupported" || artifactPreview.status === "error") && (
                        <ErrorState message={artifactPreview.message} />
                    )}
                    <Button size="xs" mt="sm" onClick={() => onBuildArtifact(card.artifactTarget!)} loading={artifactBuildRun.status === "running"}>
                        Build
                    </Button>
                    {artifactBuildRun.status === "running" && (
                        <Button size="xs" mt="sm" ml="xs" color="red" variant="light" onClick={() => onCancelArtifactBuild(card.artifactTarget!)}>
                            Cancel
                        </Button>
                    )}
                    {artifactBuildRun.status === "running" && (
                        <Text size="sm" c="dimmed" mt={4}>
                            {artifactBuildRun.progress?.preflight && (
                                <>
                                    {`Preflight: ${artifactBuildRun.progress.preflight.estimatedItemCount ?? "item count unavailable"} estimated item(s)` +
                                        `${artifactBuildRun.progress.preflight.estimatedBytes !== undefined ? `, ${artifactBuildRun.progress.preflight.estimatedBytes} estimated bytes` : ""}` +
                                        `${artifactBuildRun.progress.preflight.complexityWarning ? `. Warning: ${artifactBuildRun.progress.preflight.complexityWarning}` : ""}`}
                                    <br />
                                </>
                            )}
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
                            </Text>
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

            {card.kind === "remoteDeployment" && card.deploymentTarget && (
                <>
                    <Button
                        size="xs"
                        mt="sm"
                        loading={isActiveTarget && deployment.runLoading}
                        onClick={() => deployment.run(false, card.deploymentTarget, resolveDeploymentModes())}
                    >
                        Check compatibility
                    </Button>
                    {previewedOk && (
                        <Button
                            size="xs"
                            mt="xs"
                            ml="xs"
                            loading={isActiveTarget && deployment.runLoading}
                            onClick={() => deployment.run(true, card.deploymentTarget, resolveDeploymentModes())}
                        >
                            Publish
                        </Button>
                    )}
                    {isActiveTarget && deployment.runError && <ErrorState message={describeProjectActionError("The remote deployment", deployment.runError)} />}
                    {isActiveTarget && deployment.runResult && !deployment.runLoading && (
                        deployment.runResult.ok ? (
                            <Text size="sm" mt={4}>
                                {deployment.runResult.publish
                                    ? `Published${deployment.runResult.delivered ? "." : " -- delivery could not be confirmed."}`
                                    : "Compatible -- ready to publish."}
                            </Text>
                        ) : (
                            <IssueList title="Build issues" issues={deployment.runResult.stages.flatMap((stage) => stage.issues)} />
                        )
                    )}
                </>
            )}
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
// (deployment.run(publish, target, modes)) instead of duplicating it. An adapter card's own Check/Publish
// always runs against resolveDeploymentModes()'s own resolved library -- a session-generated bundle or an
// already-registered one, whichever resolveOutcomeLibrarySource() itself finds -- passed straight into
// deployment.run() as an explicit override, so neither case depends on the Configure step's own `modes`
// state already agreeing with it first. Every adapter card's own action always checks compatibility
// first (publish:false) and only offers "Publish" once that check comes back clean -- never a first-click
// auto-publish outside this machine. (The SDK's own
// local-json-example demo target -- the one case that could ever run straight to publish:true without a
// preview step -- is never described as a card at all here; see ExportDeployTargets.ts's own doc comment.)
export function ExportDeployTab({capabilities, deployment}: {capabilities: readonly StudioProjectCapability[]; deployment: DeploymentManager}) {
    const fetchImpl = useStudioApi();
    const openAndNavigate = useOpenProject();
    const deploymentTargets = deployment.targetsView.status === "loaded" ? deployment.targetsView.targets : [];
    const defaultModeName = resolveDefaultModeName(deployment.projectModesView);

    const [outcomeLibraryRun, setOutcomeLibraryRun] = useState<OutcomeLibraryRunView>({status: "idle"});
    const outcomeLibraryGuard = useDoubleSubmitGuard();

    const [staticExportRun, setStaticExportRun] = useState<StaticExportRunView>({status: "idle"});
    const staticExportGuard = useDoubleSubmitGuard();

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
    const cards = [...describeExportDeployTargetCards(deploymentTargets, capabilities), ...artifactCards];

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
        if (!outcomeLibraryGuard.begin()) {
            return;
        }
        setOutcomeLibraryRun({status: "running"});
        generateOutcomeLibrary(fetchImpl, {mode: defaultModeName})
            .then((view) => {
                outcomeLibraryGuard.end();
                if (view.status === "ok") {
                    setOutcomeLibraryRun({status: "ok", result: view});
                    // Feeds the freshly generated bundle straight into the shared Deployment mode row --
                    // see this file's own top-level doc comment.
                    deployment.setModeName(0, view.mode.modeName);
                    deployment.setModeLibrarySelector(0, {kind: "bundle", bundleDir: view.bundleDir, modeName: view.mode.modeName});
                    deployment.refreshProjectModesAndRegistry();
                } else {
                    setOutcomeLibraryRun({status: "error", message: describeGenerateResultError(view)});
                }
            })
            .catch((error: unknown) => {
                outcomeLibraryGuard.end();
                setOutcomeLibraryRun({status: "error", message: describeProjectActionError("The outcome library generation", errorMessage(error))});
            });
    }

    // The Stake Engine Export card's own source: prefer the library this same session just generated
    // (outcomeLibraryRun), falling back to whatever the registry already reports as compatible for
    // `defaultModeName` -- a project that already had a fresh library before Build/Export was even opened
    // never needs a redundant re-generate click first.
    function resolveOutcomeLibrarySource(): Extract<OutcomeLibrarySelector, {kind: "bundle"}> | undefined {
        if (outcomeLibraryRun.status === "ok") {
            return {kind: "bundle", bundleDir: outcomeLibraryRun.result.bundleDir, modeName: outcomeLibraryRun.result.mode.modeName};
        }
        const {registryView} = deployment;
        if (registryView?.status === "ok" && registryView.buildStatus !== "missing") {
            const mode = registryView.modes.find((entry) => entry.modeName === defaultModeName) ?? registryView.modes[0];
            if (mode !== undefined && mode.buildStatus === "compatible") {
                return {kind: "bundle", bundleDir: mode.bundleDir, modeName: mode.modeName};
            }
        }
        return undefined;
    }

    // A remote adapter card's own run source: the exact same resolved library resolveOutcomeLibrarySource()
    // already found -- a session-generated bundle or an already-registered one -- carried into a
    // StudioDeploymentModeInput whose modeName is always the *selector's own* mode (never defaultModeName
    // blindly), so a registry fallback onto a different mode than defaultModeName can never send a
    // request pairing one mode's name with another mode's library. `undefined` (no resolved library yet)
    // falls back to deployment.run()'s own default of the Configure step's `modes` state, unchanged.
    function resolveDeploymentModes(): StudioDeploymentModeInput[] | undefined {
        const source = resolveOutcomeLibrarySource();
        return source === undefined ? undefined : [{modeName: source.modeName, librarySelector: source}];
    }

    // Shared by the initial run and the conflict card's own Overwrite action -- `source` is always the
    // exact resolved mode/library selector the caller already has in hand (freshly resolved for the
    // initial run, or the one a prior conflict was reported against for Overwrite), never re-resolved
    // here, so Overwrite can never end up pairing a since-changed selector with `overwrite: true`.
    function runStaticExport(source: Extract<OutcomeLibrarySelector, {kind: "bundle"}>, overwrite: boolean): void {
        setStaticExportRun({status: "running"});
        exportStakeEngine(fetchImpl, [{modeName: source.modeName, librarySelector: source, cost: 1}], STAKE_ENGINE_DEFAULT_OUT_DIR, overwrite)
            .then((view) => {
                staticExportGuard.end();
                if (view.status === "ok") {
                    setStaticExportRun({status: "ok", result: view});
                } else if (view.status === "conflict") {
                    setStaticExportRun({status: "conflict", result: view, source});
                } else {
                    setStaticExportRun({status: "error", message: describeStakeEngineResultError(view)});
                }
            })
            .catch((error: unknown) => {
                staticExportGuard.end();
                setStaticExportRun({status: "error", message: describeProjectActionError("The Stake Engine export", errorMessage(error))});
            });
    }

    function handleRunStaticExport(): void {
        const source = resolveOutcomeLibrarySource();
        if (source === undefined || !staticExportGuard.begin()) {
            return;
        }
        runStaticExport(source, false);
    }

    function handleOverwriteStaticExport(): void {
        if (staticExportRun.status !== "conflict" || !staticExportGuard.begin()) {
            return;
        }
        runStaticExport(staticExportRun.source, true);
    }

    // Runs a single "Build artifact" card's own target through ArtifactBuilderRegistry (via
    // /api/project/artifacts/build) -- see StudioArtifactBuildService.build's own doc comment for exactly
    // what this does and doesn't promise. Guarded by this target's own current run status (rather than a
    // shared useDoubleSubmitGuard) since every target's own build runs fully independently of every other.
    function handleBuildArtifact(target: StudioArtifactTargetType): void {
        if (artifactBuildRuns[target]?.status === "running") {
            return;
        }
        startArtifactBuild(fetchImpl, target, artifactDestinations[target]?.trim() || undefined)
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
                if (job.status === "cancelled") {
                    setArtifactBuildRuns((runs) => ({...runs, [target]: {status: "cancelled"}}));
                } else if (job.result !== undefined && job.result.status === "ok") {
                    const result = job.result;
                    setArtifactBuildRuns((runs) => ({...runs, [target]: {status: "ok", result}}));
                } else {
                    const result = job.result;
                    setArtifactBuildRuns((runs) => ({
                        ...runs,
                        [target]: {status: "error", message: result !== undefined ? describeArtifactBuildResultError(result) : "Artifact build ended without a result."},
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
                Every applicable way this project can be built or leave Studio, grouped by what it actually
                does -- generating an outcome library is the source build step every other target here reads
                from, a static export writes a standalone bundle with nothing registered, and a remote
                deployment is a registered External Adapter SDK target, checked for compatibility before
                anything is published. Each card runs its own builder right here, against this project&apos;s own primary build mode
                ({defaultModeName}) -- nothing here silently runs in the background, and nothing leaves this
                tab to do it.
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
                                            onGenerateOutcomeLibrary={handleGenerateOutcomeLibrary}
                                            resolveOutcomeLibrarySource={resolveOutcomeLibrarySource}
                                            resolveDeploymentModes={resolveDeploymentModes}
                                            staticExportRun={staticExportRun}
                                            onRunStaticExport={handleRunStaticExport}
                                            onOverwriteStaticExport={handleOverwriteStaticExport}
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
