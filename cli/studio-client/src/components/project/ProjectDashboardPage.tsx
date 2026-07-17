import {Anchor, Button, Text, Title} from "@mantine/core";
import {useDocumentTitle} from "@mantine/hooks";
import {useCallback, useEffect, useRef, useState} from "react";
import {useNavigate, useParams} from "react-router-dom";
import {buildReportDownloadUrl, closeProject, getReplay, getReport, inspectProject, listReplays, listReports, validateProject} from "../../api/apiClient";
import type {StudioSimulationReportListEntry} from "../../api/types";
import {useStudioApi} from "../../context/StudioApiProvider";
import {errorMessage} from "../../domain/errorMessage";
import {
    describeInspection,
    describeNextAction,
    describeValidationSummary,
    type InspectionResultView,
    type ProjectValidationView,
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
import {RuntimeTab} from "./RuntimeTab";
import {SimulationTab, type ReportDetailState} from "./SimulationTab";
import {ValidationTab} from "./ValidationTab";

export type ProjectTab = "overview" | "validation" | "simulation" | "replay" | "runtime" | "deployment";

// Primary happy-path tabs (Overview -> Validate -> Simulate, which now also owns Reports) come first,
// unlabeled/implicit; Replay/Runtime/Deployment are tagged `section: "Advanced"` so NavTabs visually
// separates them -- everything's still one click away, just no longer presented as equal-weight to the
// main flow.
const PROJECT_TABS: NavTabItem<ProjectTab>[] = [
    {value: "overview", label: "Overview"},
    {value: "validation", label: "Validate"},
    {value: "simulation", label: "Simulation & Reports"},
    {value: "replay", label: "Replay", section: "Advanced"},
    {value: "runtime", label: "Runtime", section: "Advanced"},
    {value: "deployment", label: "Deployment", section: "Advanced"},
];

function isProjectTab(value: string | undefined): value is ProjectTab {
    return PROJECT_TABS.some((tab) => tab.value === value);
}

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
    const {tab} = useParams<{tab: string}>();
    const activeTab: ProjectTab = isProjectTab(tab) ? tab : "overview";
    // The active tab lives in the URL (`/project/:tab`, see routes.tsx) so refresh/back-forward/direct
    // links land on the right section; every existing call site below still just calls `setActiveTab(x)`,
    // now implemented as a navigation instead of local state.
    const setActiveTab = useCallback(
        (value: ProjectTab): void => {
            navigate(`/project/${value}`);
        },
        [navigate],
    );

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

    // Replacing the whole state on every attempt (not just a summary + a separate loading bool) is what
    // makes a failed re-validation correctly clear a stale successful result instead of silently leaving
    // it displayed with no error shown -- see ProjectValidationView's own doc comment.
    const [validation, setValidation] = useState<ProjectValidationView>({status: "idle"});
    const validateGuard = useDoubleSubmitGuard();
    const runValidate = useCallback(() => {
        if (!validateGuard.begin()) {
            return;
        }
        setValidation({status: "loading"});
        validateProject(fetchImpl)
            .then((report) => setValidation({status: "success", summary: describeValidationSummary(report)}))
            .catch((error: unknown) => setValidation({status: "error", message: errorMessage(error)}))
            .finally(() => validateGuard.end());
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fetchImpl]);

    const simulation = useSimulationPoll();

    const [reportsView, setReportsView] = useState<ReportListView>({status: "empty"});
    const [reportsError, setReportsError] = useState<string>();
    const refreshReports = useCallback(() => {
        listReports(fetchImpl)
            .then((entries) => setReportsView(describeReportsList(entries)))
            .catch((error: unknown) => setReportsError(errorMessage(error)));
    }, [fetchImpl]);
    const [reportDetail, setReportDetail] = useState<ReportDetailState>({status: "empty"});
    const [selectedReportId, setSelectedReportId] = useState<string>();

    // Used both to auto-open the just-completed live job's report (see the effect below) and to open a
    // historic entry straight from the Recent Runs list -- either way this is "the report Review should
    // show", by id, fetched fresh from the server rather than reused from in-memory job state (matches
    // the pre-merge ReportsTab's own behavior).
    const selectReport = useCallback(
        (id: string) => {
            setActiveTab("simulation");
            setSelectedReportId(id);
            setReportDetail({status: "loading"});
            getReport(fetchImpl, id)
                .then((report) => setReportDetail({status: "loaded", report: describeSimulationReport(report)}))
                .catch((error: unknown) => setReportDetail({status: "error", message: errorMessage(error)}));
        },
        [fetchImpl, setActiveTab],
    );

    // Auto-opens the report the instant a *live* job this session started completes -- requirement 5's
    // "auto-open summary" -- and refreshes the Recent Runs list so the just-finished run shows up there
    // too without the user having to remember to click Refresh. Guarded by job id (not just status) so
    // this fires exactly once per completed job, not on every poll tick while status stays "completed".
    const autoOpenedJobIdRef = useRef<string | undefined>(undefined);
    useEffect(() => {
        if (simulation.job?.status === "completed" && simulation.job.id !== autoOpenedJobIdRef.current) {
            autoOpenedJobIdRef.current = simulation.job.id;
            selectReport(simulation.job.id);
            refreshReports();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [simulation.job, selectReport]);

    const [compareDetail, setCompareDetail] = useState<ReportDetailState>({status: "empty"});

    // Every path that starts a new run (Configure submit, Retry, a Recent Runs "Run again") funnels
    // through here so a previous run's report/compare state never lingers stale while the new one is
    // in flight.
    const startRun = useCallback(
        (rounds: number, seed: string | undefined, workers: number) => {
            setReportDetail({status: "empty"});
            setSelectedReportId(undefined);
            setCompareDetail({status: "empty"});
            simulation.run(rounds, seed, workers);
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [simulation.run],
    );

    const onCompare = useCallback(
        (entry: StudioSimulationReportListEntry) => {
            setCompareDetail({status: "loading"});
            getReport(fetchImpl, entry.id)
                .then((report) => setCompareDetail({status: "loaded", report: describeSimulationReport(report)}))
                .catch((error: unknown) => setCompareDetail({status: "error", message: errorMessage(error)}));
        },
        [fetchImpl],
    );
    const onClearCompare = useCallback(() => setCompareDetail({status: "empty"}), []);

    const onRunAgain = useCallback(
        (entry: StudioSimulationReportListEntry) => {
            const doRun = (): void => startRun(entry.requestedRounds, entry.seed, entry.workers);
            if (simulation.job !== undefined && isSimulationActive(simulation.job)) {
                confirm("A simulation is already running. Start a new one with this configuration instead?", doRun);
            } else {
                doRun();
            }
        },
        [simulation.job, startRun, confirm],
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

    // Moves focus into the active tab's content whenever the section changes, keeping keyboard/screen-
    // reader users oriented after a navigation -- keyed on header.status too so it also fires once more
    // when the page finishes loading fresh from Home (the wrapper this ref points at doesn't exist yet
    // while still "loading", so the very first activeTab-only effect run can't reach it).
    const panelRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        panelRef.current?.focus();
    }, [activeTab, header.status]);

    const nextAction = describeNextAction(validation, simulation.job);
    const onNextAction = (): void => {
        if (nextAction.kind === "validate" || nextAction.kind === "validation-failed") {
            setActiveTab("validation");
            runValidate();
        } else if (nextAction.kind === "fix-validation") {
            setActiveTab("validation");
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
    const onConfigureGameModel = blueprintSource ? () => navigate("/home/design", {state: {initialBlueprintPath: blueprintSource}}) : undefined;

    const handleClose = (): void => {
        const doClose = (): void => {
            closeProject(fetchImpl)
                .then(() => navigate("/home/design"))
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
                    No active project. <Anchor href="#/home/design">Go to Home</Anchor>.
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
                <div ref={panelRef} tabIndex={-1} style={{marginTop: "1rem"}}>
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
                    {activeTab === "validation" && <ValidationTab view={validation} onValidate={runValidate} />}
                    {activeTab === "simulation" && (
                        <SimulationTab
                            progress={simulation.progress}
                            error={simulation.error}
                            onRun={startRun}
                            onCancel={simulation.cancel}
                            onRetry={() => simulation.job && startRun(simulation.job.rounds, simulation.job.seed, simulation.job.workers)}
                            recentRuns={reportsView}
                            recentRunsError={reportsError}
                            onRefreshRecentRuns={refreshReports}
                            reviewedDetail={reportDetail}
                            onOpenHistoric={(entry: StudioSimulationReportListEntry) => selectReport(entry.id)}
                            onRunAgain={onRunAgain}
                            compareDetail={compareDetail}
                            onCompare={onCompare}
                            onClearCompare={onClearCompare}
                            downloadUrls={
                                selectedReportId
                                    ? {
                                        json: buildReportDownloadUrl(selectedReportId, "json"),
                                        markdown: buildReportDownloadUrl(selectedReportId, "markdown"),
                                        html: buildReportDownloadUrl(selectedReportId, "html"),
                                    }
                                    : undefined
                            }
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
