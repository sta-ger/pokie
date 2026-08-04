import {useState} from "react";
import {Badge, Button, Group, List, Text} from "@mantine/core";
import {exportStakeEngine, generateOutcomeLibrary, openOutputFolder} from "../../api/apiClient";
import type {
    OutcomeLibrarySelector,
    StudioDeploymentModeInput,
    StudioOutcomeLibraryGenerateResultView,
    StudioProjectCapability,
    StudioStakeEngineExportView,
} from "../../api/types";
import {useStudioApi} from "../../context/StudioApiProvider";
import {
    describeExportDeployTargetCards,
    type ExportDeployTargetCard,
    type ExportDeployTargetKind,
} from "../../domain/interpret/ExportDeployTargets";
import {errorMessage} from "../../domain/errorMessage";
import {describePathActionError} from "../../domain/pathActionError";
import {describeProjectActionError} from "../../domain/projectActionError";
import type {DeploymentManager} from "../../hooks/useDeploymentManager";
import {useDoubleSubmitGuard} from "../../hooks/useDoubleSubmitGuard";
import {EmptyState} from "../common/EmptyState";
import {ErrorState} from "../common/ErrorState";
import {IssueList} from "../common/IssueList";
import {LoadingState} from "../common/LoadingState";
import {PageSection} from "../common/PageSection";
import {QuickActions} from "../common/QuickActions";
import {RecoveryNotice} from "../common/RecoveryNotice";

const GROUP_LABELS: Record<ExportDeployTargetKind, {legend: string; blurb: string}> = {
    outcomeLibrary: {
        legend: "Outcome libraries",
        blurb: "Generates or selects the canonical outcome library every other builder below reads from -- a build step in its own right, not a delivery target.",
    },
    staticExport: {
        legend: "Static export",
        blurb: "Writes a standalone, self-contained bundle to disk -- nothing is registered, nothing runs a delivery step.",
    },
    remoteDeployment: {
        legend: "Remote deployment",
        blurb: "A registered External Adapter SDK target, checked for compatibility before Publish is ever offered -- the SDK's own local-json-example demo target is deliberately never listed here (see ExportDeployTargets.ts's own doc comment); register a real target to replace this group's placeholder.",
    },
};

const GROUP_ORDER: readonly ExportDeployTargetKind[] = ["outcomeLibrary", "staticExport", "remoteDeployment"];

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
    const deploymentTargets = deployment.targetsView.status === "loaded" ? deployment.targetsView.targets : [];
    const cards = describeExportDeployTargetCards(deploymentTargets, capabilities);
    const defaultModeName = resolveDefaultModeName(deployment.projectModesView);

    const [outcomeLibraryRun, setOutcomeLibraryRun] = useState<OutcomeLibraryRunView>({status: "idle"});
    const outcomeLibraryGuard = useDoubleSubmitGuard();

    const [staticExportRun, setStaticExportRun] = useState<StaticExportRunView>({status: "idle"});
    const staticExportGuard = useDoubleSubmitGuard();

    const [openFolderError, setOpenFolderError] = useState<string>();

    function handleOpenFolder(path: string): void {
        setOpenFolderError(undefined);
        openOutputFolder(fetchImpl, path)
            .then((view) => {
                if (view.status === "unavailable") {
                    setOpenFolderError(view.reason);
                } else if (view.status === "error") {
                    setOpenFolderError(view.message);
                }
            })
            .catch((error: unknown) => setOpenFolderError(errorMessage(error)));
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
                                groupCards.map((card) => (
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
                                    />
                                ))
                            )}
                        </PageSection>
                    );
                })
            )}
        </div>
    );
}
