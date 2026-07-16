import {Anchor, Button, Text, Title} from "@mantine/core";
import {useDocumentTitle} from "@mantine/hooks";
import {useCallback, useEffect, useState} from "react";
import {useNavigate} from "react-router-dom";
import {buildReportDownloadUrl, closeProject, getReplay, getReport, inspectProject, listReplays, listReports, validateProject} from "../../api/apiClient";
import type {SimulationReport, StudioSimulationReportListEntry} from "../../api/types";
import {useStudioApi} from "../../context/StudioApiProvider";
import {errorMessage} from "../../domain/errorMessage";
import {
    describeInspection,
    describeNextAction,
    describeValidationSummary,
    type InspectionResultView,
    type ValidationSummaryView,
} from "../../domain/interpret/ProjectDashboard";
import {describeReplayList, describeReplayResult, isReplayActive, type ReplayListView} from "../../domain/interpret/Replay";
import {describeReportsList, type ReportListView} from "../../domain/interpret/Reports";
import {describeSimulationReport, isSimulationActive} from "../../domain/interpret/Simulation";
import {useConfirm} from "../../hooks/useConfirm";
import {useDeploymentManager} from "../../hooks/useDeploymentManager";
import {useDoubleSubmitGuard} from "../../hooks/useDoubleSubmitGuard";
import {useProjectContext} from "../../hooks/useProjectContext";
import {useReplayPoll} from "../../hooks/useReplayPoll";
import {useRuntimeManager} from "../../hooks/useRuntimeManager";
import {useSimulationPoll} from "../../hooks/useSimulationPoll";
import {AppShellLayout} from "../layout/AppShellLayout";
import {NavTabs, type NavTabItem} from "../layout/NavTabs";
import {DeploymentTab} from "./DeploymentTab";
import {OverviewTab} from "./OverviewTab";
import {ReplayTab} from "./ReplayTab";
import {ReportsTab, type ReportDetailState} from "./ReportsTab";
import {RuntimeTab} from "./RuntimeTab";
import {SimulationTab} from "./SimulationTab";
import {ValidationTab} from "./ValidationTab";

export type ProjectTab = "overview" | "validation" | "simulation" | "reports" | "replay" | "runtime" | "deployment";

// Primary happy-path tabs (Overview -> Validate -> Simulate -> Reports) come first, unlabeled/implicit;
// Replay/Runtime/Deployment are tagged `section: "Advanced"` so NavTabs visually separates them --
// everything's still one click away, just no longer presented as equal-weight to the main flow.
const PROJECT_TABS: NavTabItem<ProjectTab>[] = [
    {value: "overview", label: "Overview"},
    {value: "validation", label: "Validate"},
    {value: "simulation", label: "Simulate"},
    {value: "reports", label: "Reports"},
    {value: "replay", label: "Replay", section: "Advanced"},
    {value: "runtime", label: "Runtime", section: "Advanced"},
    {value: "deployment", label: "Deployment", section: "Advanced"},
];

// Mirrors the old app's own showProjectDashboard: every tab's data-loading hook lives here, at the page
// level, and stays mounted regardless of which tab is currently visible -- switching tabs only changes
// what's rendered, never what's running. This matters because the old app kept every section in the DOM
// simultaneously (just hidden via CSS), so a Simulation/Replay run (or an in-flight Deployment request)
// was never interrupted by looking at a different tab; conditionally *mounting* only the active tab's
// hook would silently cancel that background work, which this file exists specifically to avoid.
export function ProjectDashboardPage() {
    const fetchImpl = useStudioApi();
    const navigate = useNavigate();
    const confirm = useConfirm();
    const [activeTab, setActiveTab] = useState<ProjectTab>("overview");

    const header = useProjectContext();
    const projectKey = header.status === "loaded" || header.status === "error" ? header.projectRoot : undefined;

    const [inspection, setInspection] = useState<InspectionResultView>({status: "loading"});
    const inspectGuard = useDoubleSubmitGuard();
    const refreshInspect = useCallback(() => {
        if (!inspectGuard.begin()) {
            return;
        }
        setInspection({status: "loading"});
        inspectProject(fetchImpl)
            .then((report) => setInspection(describeInspection(report)))
            .catch((error: unknown) => setInspection({status: "error", message: errorMessage(error)}))
            .finally(() => inspectGuard.end());
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fetchImpl]);

    const [validation, setValidation] = useState<ValidationSummaryView>();
    const [validationLoading, setValidationLoading] = useState(false);
    const validateGuard = useDoubleSubmitGuard();
    const runValidate = useCallback(() => {
        if (!validateGuard.begin()) {
            return;
        }
        setValidationLoading(true);
        validateProject(fetchImpl)
            .then((report) => setValidation(describeValidationSummary(report)))
            .catch(() => undefined)
            .finally(() => {
                setValidationLoading(false);
                validateGuard.end();
            });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fetchImpl]);

    const simulation = useSimulationPoll();
    const [simulationReport, setSimulationReport] = useState<ReturnType<typeof describeSimulationReport>>();
    useEffect(() => {
        if (simulation.job?.status === "completed" && simulation.job.report) {
            setSimulationReport(describeSimulationReport(simulation.job.report, simulation.job.statistics));
        }
    }, [simulation.job]);
    const [lastSimulationParams, setLastSimulationParams] = useState<{rounds: number; seed?: string; workers: number}>();

    const [reportsView, setReportsView] = useState<ReportListView>({status: "empty"});
    const [reportsError, setReportsError] = useState<string>();
    const refreshReports = useCallback(() => {
        listReports(fetchImpl)
            .then((entries) => setReportsView(describeReportsList(entries)))
            .catch((error: unknown) => setReportsError(errorMessage(error)));
    }, [fetchImpl]);
    const [reportDetail, setReportDetail] = useState<ReportDetailState>({status: "empty"});
    const [reportDetailRaw, setReportDetailRaw] = useState<SimulationReport>();
    const [selectedReportId, setSelectedReportId] = useState<string>();

    const selectReport = useCallback(
        (id: string) => {
            setActiveTab("reports");
            setSelectedReportId(id);
            setReportDetail({status: "loading"});
            getReport(fetchImpl, id)
                .then((report) => {
                    setReportDetailRaw(report);
                    setReportDetail({status: "loaded", report: describeSimulationReport(report)});
                })
                .catch((error: unknown) => setReportDetail({status: "error", message: errorMessage(error)}));
        },
        [fetchImpl],
    );

    const [replayListView, setReplayListView] = useState<ReplayListView>({status: "empty"});
    const [replayListError, setReplayListError] = useState<string>();
    const refreshReplayList = useCallback(() => {
        listReplays(fetchImpl)
            .then((entries) => setReplayListView(describeReplayList(entries)))
            .catch((error: unknown) => setReplayListError(errorMessage(error)));
    }, [fetchImpl]);
    const replay = useReplayPoll(refreshReplayList);
    const [lastReplayParams, setLastReplayParams] = useState<{round: number; seed?: string}>();

    const runtime = useRuntimeManager();
    const deployment = useDeploymentManager();

    useEffect(() => {
        if (projectKey === undefined) {
            return;
        }
        refreshInspect();
        refreshReports();
        refreshReplayList();
        runtime.refresh();
        deployment.refreshTargets();
        // Deliberately keyed only on projectKey -- these refreshers should run once per newly-loaded
        // project, not every time one of their own (stable, useCallback-memoized) references changes.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [projectKey]);

    const hasActiveOperation =
        (simulation.job !== undefined && isSimulationActive(simulation.job)) ||
        (replay.job !== undefined && isReplayActive(replay.job)) ||
        runtime.running;

    const activeTabLabel = PROJECT_TABS.find((tab) => tab.value === activeTab)?.label ?? "Overview";
    const projectName = header.status === "loaded" ? header.name : "Project";
    useDocumentTitle(`${projectName} · ${activeTabLabel} · POKIE Studio`);

    const nextAction = describeNextAction(validation, simulation.job);
    const onNextAction = (): void => {
        if (nextAction.kind === "validate" || nextAction.kind === "fix-validation") {
            setActiveTab("validation");
            if (nextAction.kind === "validate") {
                runValidate();
            }
        } else if (nextAction.kind === "simulate") {
            setActiveTab("simulation");
        } else if (nextAction.kind === "simulation-running") {
            setActiveTab("simulation");
        } else if (simulation.currentJobId) {
            selectReport(simulation.currentJobId);
        }
    };

    // Only offered once the package is known to have come from a blueprint this Studio can reopen (a
    // `pokie build` provenance with a real source path -- describeProvenance's own "(unknown)" sentinel
    // means the path is genuinely not known, e.g. an older build-info without it).
    const blueprintSource =
        inspection.status === "loaded" && inspection.provenance.status === "generated" && inspection.provenance.source !== "(unknown)"
            ? inspection.provenance.source
            : undefined;
    const onConfigureGameModel = blueprintSource ? () => navigate("/", {state: {initialBlueprintPath: blueprintSource}}) : undefined;

    const handleClose = (): void => {
        const doClose = (): void => {
            closeProject(fetchImpl)
                .then(() => navigate("/"))
                .catch(() => undefined);
        };
        if (hasActiveOperation) {
            confirm("This project has an active simulation, replay, or running runtime. Close the project anyway?", doClose);
        } else {
            doClose();
        }
    };

    if (header.status === "empty") {
        return (
            <AppShellLayout navbar={<NavTabs items={PROJECT_TABS} active={activeTab} onSelect={setActiveTab} />}>
                <Text>
                    No active project. <Anchor href="#/">Go to Home</Anchor>.
                </Text>
            </AppShellLayout>
        );
    }

    return (
        <AppShellLayout
            navbar={<NavTabs items={PROJECT_TABS} active={activeTab} onSelect={setActiveTab} />}
            breadcrumbs={[
                {label: projectName, onClick: () => setActiveTab("overview")},
                {label: activeTabLabel},
            ]}
        >
            <div>
                <Title order={2}>{header.status === "loaded" ? header.name : "Project"}</Title>
                <Text c="dimmed">{header.projectRoot}</Text>
                <Button variant="default" size="xs" mt="xs" onClick={handleClose}>
                    Close project
                </Button>
            </div>

            {header.status === "loading" && <Text mt="md">Loading project…</Text>}
            {header.status === "error" && <Text mt="md">{header.message}</Text>}

            {(header.status === "loaded" || header.status === "error") && (
                <div style={{marginTop: "1rem"}}>
                    {activeTab === "overview" && header.status === "loaded" && (
                        <OverviewTab
                            header={header}
                            inspection={inspection}
                            nextAction={nextAction}
                            onNextAction={onNextAction}
                            onConfigureGameModel={onConfigureGameModel}
                            onReinspect={refreshInspect}
                        />
                    )}
                    {activeTab === "validation" && <ValidationTab summary={validation} loading={validationLoading} onValidate={runValidate} />}
                    {activeTab === "simulation" && (
                        <SimulationTab
                            progress={simulation.progress}
                            report={simulationReport}
                            error={simulation.error}
                            onRun={(rounds, seed, workers) => {
                                setLastSimulationParams({rounds, seed, workers});
                                simulation.run(rounds, seed, workers);
                            }}
                            onCancel={simulation.cancel}
                            onRerun={() =>
                                lastSimulationParams && simulation.run(lastSimulationParams.rounds, lastSimulationParams.seed, lastSimulationParams.workers)
                            }
                            onViewInReports={() => {
                                if (simulation.currentJobId) {
                                    selectReport(simulation.currentJobId);
                                    refreshReports();
                                }
                            }}
                        />
                    )}
                    {activeTab === "reports" && (
                        <ReportsTab
                            listView={reportsView}
                            listError={reportsError}
                            onRefresh={refreshReports}
                            onSelect={(entry: StudioSimulationReportListEntry) => selectReport(entry.id)}
                            detail={reportDetail}
                            downloadUrls={
                                selectedReportId
                                    ? {
                                        json: buildReportDownloadUrl(selectedReportId, "json"),
                                        markdown: buildReportDownloadUrl(selectedReportId, "markdown"),
                                        html: buildReportDownloadUrl(selectedReportId, "html"),
                                    }
                                    : undefined
                            }
                            onBackToSimulation={() => {
                                if (reportDetailRaw) {
                                    setLastSimulationParams({
                                        rounds: reportDetailRaw.requestedRounds,
                                        seed: reportDetailRaw.seed ?? undefined,
                                        workers: reportDetailRaw.workers ?? 1,
                                    });
                                }
                                setActiveTab("simulation");
                            }}
                        />
                    )}
                    {activeTab === "replay" && (
                        <ReplayTab
                            progress={replay.progress}
                            result={replay.job?.status === "completed" ? describeReplayResult(replay.job) : undefined}
                            error={replay.error}
                            onRun={(round, seed) => {
                                setLastReplayParams({round, seed});
                                replay.run(round, seed);
                            }}
                            onCancel={replay.cancel}
                            onRerun={() => lastReplayParams && replay.run(lastReplayParams.round, lastReplayParams.seed)}
                            listView={replayListView}
                            listError={replayListError}
                            onRefreshList={refreshReplayList}
                            onSelect={(id) => {
                                getReplay(fetchImpl, id).then((job) => {
                                    setLastReplayParams({round: job.round, seed: job.seed});
                                    replay.selectExisting(job);
                                });
                            }}
                        />
                    )}
                    {activeTab === "runtime" && (
                        <RuntimeTab
                            state={runtime.state}
                            running={runtime.running}
                            session={runtime.session}
                            onRefresh={runtime.refresh}
                            onStart={runtime.start}
                            onStop={runtime.stop}
                            onRestart={runtime.restart}
                            onCreateSession={runtime.createSession}
                            onLoadSession={runtime.loadSession}
                            onSpin={runtime.spin}
                            onRepeatSpin={runtime.repeatSpin}
                            history={runtime.history}
                        />
                    )}
                    {activeTab === "deployment" && (
                        <DeploymentTab
                            targetsView={deployment.targetsView}
                            targetsError={deployment.targetsError}
                            onRefreshTargets={deployment.refreshTargets}
                            selectedTarget={deployment.selectedTarget}
                            onSelectTarget={deployment.selectTarget}
                            modes={deployment.modes}
                            onUpdateMode={deployment.updateMode}
                            onAddMode={deployment.addMode}
                            onRemoveMode={deployment.removeMode}
                            onPreview={() => deployment.run(false)}
                            onDeploy={() => deployment.run(true)}
                            runResult={deployment.runResult}
                            runError={deployment.runError}
                            runLoading={deployment.runLoading}
                            selectedArtifactPath={deployment.selectedArtifactPath}
                            onSelectArtifact={deployment.selectArtifact}
                        />
                    )}
                </div>
            )}
        </AppShellLayout>
    );
}
