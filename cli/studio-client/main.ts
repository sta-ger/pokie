import {
    buildReportDownloadUrl,
    cancelReplay,
    cancelSimulation,
    closeProject,
    createProject,
    FetchLike,
    getContext,
    getProjectContext,
    getReplay,
    getReport,
    getSimulation,
    inspectProject,
    listRecentProjects,
    listReplays,
    listReports,
    openProject,
    runReplay,
    startSimulation,
    validateProject,
} from "./apiClient.js";
import {
    Elements,
    ProjectTab,
    queryElements,
    renderInspectionResult,
    renderProjectHeader,
    renderRecentProjects,
    renderReplayError,
    renderReplayList,
    renderReplayListError,
    renderReplayProgress,
    renderReplayResult,
    renderReportDetailState,
    renderReportsList,
    renderReportsListError,
    renderSimulationError,
    renderSimulationProgress,
    renderSimulationReport,
    renderValidationSummary,
    setStatus,
    showProjectTab,
    showView,
} from "./dom.js";
import {describeInspection, describeProjectHeader, describeValidationSummary} from "./interpretProjectDashboard.js";
import {describeReplayList, describeReplayProgress, describeReplayResult, isReplayActive, isReplayTerminal} from "./interpretReplay.js";
import {describeReportsList} from "./interpretReports.js";
import {describeSimulationProgress, describeSimulationReport, isSimulationActive} from "./interpretSimulation.js";
import {currentRoute, navigate, onRouteChange, StudioRoute} from "./router.js";
import type {
    ProjectDashboardContext,
    SimulationReport,
    StudioContext,
    StudioReplayJobView,
    StudioSimulationJobView,
} from "./types.js";

// How long/often to re-check GET /api/project/context while it reports "loading" — only ever
// happens right after Studio starts directly into Project mode (`pokie .`/`pokie <path>`), since
// Create/Open both resolve straight to "loaded"/an error response. Bounded so a pathologically
// hanging entry-module load doesn't poll forever.
const PROJECT_POLL_INTERVAL_MS = 500;
const PROJECT_POLL_MAX_ATTEMPTS = 40;

// How often to re-check GET /api/project/simulations/:id while queued/running. Unlike the dashboard
// poll above, this has no max-attempts cap — a legitimate simulation is allowed to run as long as it
// actually takes; polling only stops once the job reaches a terminal status or the user navigates
// away from the Project route.
const SIMULATION_POLL_INTERVAL_MS = 500;

// Same reasoning as SIMULATION_POLL_INTERVAL_MS — a replay now runs as a chunked background job (see
// StudioReplayExecutionService), never blocking the request that started it, so this polls
// GET /api/project/replays/:id until it reaches a terminal status.
const REPLAY_POLL_INTERVAL_MS = 500;

function routeForContext(context: StudioContext): StudioRoute {
    return context.mode === "project" ? "project" : "home";
}

async function refreshRecentProjects(elements: Elements, fetchImpl: FetchLike, onOpen: (projectRoot: string) => void): Promise<void> {
    const entries = await listRecentProjects(fetchImpl);
    renderRecentProjects(elements.recentList, entries, onOpen);
}

async function main(): Promise<void> {
    const elements = queryElements();
    const fetchImpl = window.fetch.bind(window) as FetchLike;
    let activeProjectTab: ProjectTab = "overview";

    // Inspect is safe to run whenever the dashboard shows "loaded" or "error" — it only ever reads
    // package.json/build-info.json, independent of whether the entry module itself loaded — so it's
    // both the automatic fetch on dashboard load and the manual "Re-run Inspect" quick action. A
    // *successful* call reporting an invalid/unreadable package still renders as "loaded" (see
    // describeInspection) — only the API call itself failing (e.g. a 409) renders as "error" here.
    const refreshInspect = (): void => {
        renderInspectionResult(elements, {status: "loading"});
        inspectProject(fetchImpl)
            .then((report) => {
                renderInspectionResult(elements, describeInspection(report));
            })
            .catch((error: unknown) => {
                renderInspectionResult(elements, {
                    status: "error",
                    message: error instanceof Error ? error.message : String(error),
                });
            });
    };

    const runValidate = (): void => {
        setStatus(elements.validationStatus, "Validating…");
        validateProject(fetchImpl)
            .then((report) => {
                setStatus(elements.validationStatus, "");
                renderValidationSummary(elements, describeValidationSummary(report));
            })
            .catch((error: unknown) => {
                setStatus(elements.validationStatus, error instanceof Error ? error.message : String(error));
            });
    };

    // Tracked so the Cancel/re-run buttons and background polling know which job to act on — reset
    // whenever a (new) project becomes active (see showProjectDashboard below), same as Inspect's own
    // per-project state.
    let currentSimulationId: string | undefined;
    let lastSimulationParams: {rounds: number; seed?: string} | undefined;
    // The report currently shown in the Reports tab's detail view — kept so "Back to Simulation
    // parameters" can read its rounds/seed without a second fetch.
    let currentReportDetail: SimulationReport | undefined;

    // Tracked so the Cancel/re-run buttons and background polling know which job to act on — reset
    // whenever a (new) project becomes active (see showProjectDashboard below), same as Simulation's
    // own per-project state.
    let currentReplayId: string | undefined;
    let lastReplayParams: {round: number; seed?: string} | undefined;

    const renderSimulationJob = (job: StudioSimulationJobView): void => {
        renderSimulationProgress(elements, describeSimulationProgress(job));
        elements.simulationViewInReportsButton.hidden = job.status !== "completed";
        if (job.status === "completed" && job.report) {
            renderSimulationReport(elements.simulationReport, describeSimulationReport(job.report, job.statistics));
        }
    };

    const refreshReports = (): void => {
        listReports(fetchImpl)
            .then((entries) => {
                renderReportsList(elements, describeReportsList(entries), (entry) => selectReport(entry.id));
            })
            .catch((error: unknown) => {
                renderReportsListError(elements, error instanceof Error ? error.message : String(error));
            });
    };

    // Shared by clicking a Reports-list entry and the Simulation tab's own "View in Reports" bridge
    // button — switches to the Reports tab, points the download links at `id`, and fetches/renders
    // the full report.
    const selectReport = (id: string): void => {
        activeProjectTab = "reports";
        showProjectTab(elements, "reports");
        renderReportDetailState(elements, {status: "loading"});
        elements.reportDownloadJson.href = buildReportDownloadUrl(id, "json");
        elements.reportDownloadMarkdown.href = buildReportDownloadUrl(id, "markdown");
        elements.reportDownloadHtml.href = buildReportDownloadUrl(id, "html");

        getReport(fetchImpl, id)
            .then((report) => {
                currentReportDetail = report;
                renderReportDetailState(elements, {status: "loaded"});
                renderSimulationReport(elements.reportDetailReport, describeSimulationReport(report));
            })
            .catch((error: unknown) => {
                renderReportDetailState(elements, {
                    status: "error",
                    message: error instanceof Error ? error.message : String(error),
                });
            });
    };

    const renderReplayJob = (job: StudioReplayJobView): void => {
        renderReplayProgress(elements, describeReplayProgress(job));
        if (job.status === "completed") {
            const result = describeReplayResult(job);
            if (result) {
                renderReplayResult(elements, result);
            }
        }
    };

    const refreshReplays = (): void => {
        listReplays(fetchImpl)
            .then((entries) => {
                renderReplayList(elements, describeReplayList(entries), (entry) => selectReplay(entry.id));
            })
            .catch((error: unknown) => {
                renderReplayListError(elements, error instanceof Error ? error.message : String(error));
            });
    };

    const pollReplay = (id: string): void => {
        getReplay(fetchImpl, id)
            .then((job) => {
                renderReplayJob(job);
                if (isReplayActive(job) && currentRoute() === "project") {
                    setTimeout(() => pollReplay(id), REPLAY_POLL_INTERVAL_MS);
                } else if (isReplayTerminal(job)) {
                    refreshReplays();
                }
            })
            .catch((error: unknown) => {
                renderReplayError(elements, error instanceof Error ? error.message : String(error));
            });
    };

    // Selecting a Replay-list entry re-fetches its full job (so a still-running one resumes live
    // polling instead of showing stale progress) and points the round/seed fields + "Run again" at it.
    const selectReplay = (id: string): void => {
        currentReplayId = id;
        getReplay(fetchImpl, id)
            .then((job) => {
                lastReplayParams = {round: job.round, seed: job.seed};
                elements.replayRoundInput.value = String(job.round);
                elements.replaySeedInput.value = job.seed ?? "";
                renderReplayJob(job);
                if (isReplayActive(job)) {
                    pollReplay(id);
                }
            })
            .catch((error: unknown) => {
                renderReplayError(elements, error instanceof Error ? error.message : String(error));
            });
    };

    const runReplayAndRender = (round: number, seed?: string): void => {
        lastReplayParams = {round, seed};
        renderReplayProgress(elements, {status: "queued", completedRounds: 0, round, percent: 0, durationMs: 0});
        elements.replayResult.hidden = true;
        runReplay(fetchImpl, round, seed)
            .then((result) => {
                if (result.status === "conflict") {
                    currentReplayId = result.activeJobId;
                    pollReplay(result.activeJobId);
                    return;
                }
                currentReplayId = result.job.id;
                renderReplayJob(result.job);
                pollReplay(result.job.id);
            })
            .catch((error: unknown) => {
                renderReplayError(elements, error instanceof Error ? error.message : String(error));
            });
    };

    const pollSimulation = (id: string): void => {
        getSimulation(fetchImpl, id)
            .then((job) => {
                renderSimulationJob(job);
                if (isSimulationActive(job) && currentRoute() === "project") {
                    setTimeout(() => pollSimulation(id), SIMULATION_POLL_INTERVAL_MS);
                }
            })
            .catch((error: unknown) => {
                renderSimulationError(elements, error instanceof Error ? error.message : String(error));
            });
    };

    const runSimulation = (rounds: number, seed?: string): void => {
        lastSimulationParams = {rounds, seed};
        renderSimulationProgress(elements, {status: "queued", roundsCompleted: 0, rounds, percent: 0, durationMs: 0});
        startSimulation(fetchImpl, rounds, seed)
            .then((result) => {
                if (result.status === "conflict") {
                    currentSimulationId = result.activeJobId;
                    pollSimulation(result.activeJobId);
                    return;
                }
                currentSimulationId = result.job.id;
                renderSimulationJob(result.job);
                pollSimulation(result.job.id);
            })
            .catch((error: unknown) => {
                renderSimulationError(elements, error instanceof Error ? error.message : String(error));
            });
    };

    const showProjectDashboard = (dashboard: ProjectDashboardContext): void => {
        renderProjectHeader(elements, describeProjectHeader(dashboard), activeProjectTab);
        if (dashboard.status === "loaded" || dashboard.status === "error") {
            refreshInspect();
            currentSimulationId = undefined;
            lastSimulationParams = undefined;
            renderSimulationProgress(elements, undefined);
            elements.simulationReport.container.hidden = true;
            elements.simulationViewInReportsButton.hidden = true;
            currentReportDetail = undefined;
            renderReportDetailState(elements, {status: "empty"});
            refreshReports();
            currentReplayId = undefined;
            lastReplayParams = undefined;
            renderReplayProgress(elements, undefined);
            elements.replayResult.hidden = true;
            refreshReplays();
        }
    };

    const pollProjectDashboard = (attemptsLeft: number): void => {
        getProjectContext(fetchImpl)
            .then((dashboard) => {
                showProjectDashboard(dashboard);
                if (dashboard.status === "loading" && attemptsLeft > 0 && currentRoute() === "project") {
                    setTimeout(() => pollProjectDashboard(attemptsLeft - 1), PROJECT_POLL_INTERVAL_MS);
                }
            })
            .catch((error: unknown) => {
                setStatus(elements.status, error instanceof Error ? error.message : String(error));
            });
    };

    // Shared by both the Open Project form and clicking a Recent Projects entry — opens
    // `projectRoot` through the API and, on success, switches the app to the Project route. Throws
    // on failure so each caller decides how to surface the error (the form clears/sets its own
    // status text; a recent-projects click reuses the same status element).
    const openAndNavigate = async (projectRoot: string): Promise<void> => {
        const {context} = await openProject(fetchImpl, projectRoot);
        navigate("project");
        showView(elements, "project");
        if (context.mode === "project") {
            pollProjectDashboard(PROJECT_POLL_MAX_ATTEMPTS);
        }
    };

    const refreshHome = (): void => {
        refreshRecentProjects(elements, fetchImpl, (projectRoot) => {
            openAndNavigate(projectRoot).catch((error: unknown) => {
                setStatus(elements.openStatus, error instanceof Error ? error.message : String(error));
            });
        }).catch((error: unknown) => {
            setStatus(elements.status, error instanceof Error ? error.message : String(error));
        });
    };

    try {
        setStatus(elements.status, "Connecting…");
        const context = await getContext(fetchImpl);
        navigate(routeForContext(context));
        showView(elements, currentRoute());
        if (currentRoute() === "home") {
            refreshHome();
        } else {
            pollProjectDashboard(PROJECT_POLL_MAX_ATTEMPTS);
        }
        setStatus(elements.status, "Ready");
    } catch (error) {
        setStatus(elements.status, error instanceof Error ? error.message : String(error));
        return;
    }

    onRouteChange((route) => {
        showView(elements, route);
        if (route === "home") {
            refreshHome();
        } else {
            pollProjectDashboard(PROJECT_POLL_MAX_ATTEMPTS);
        }
    });

    elements.createForm.addEventListener("submit", (event) => {
        event.preventDefault();
        setStatus(elements.createStatus, "Creating…");
        createProject(fetchImpl, elements.createName.value)
            .then(({context}) => {
                setStatus(elements.createStatus, "");
                navigate("project");
                showView(elements, "project");
                if (context.mode === "project") {
                    pollProjectDashboard(PROJECT_POLL_MAX_ATTEMPTS);
                }
            })
            .catch((error: unknown) => {
                setStatus(elements.createStatus, error instanceof Error ? error.message : String(error));
            });
    });

    elements.openForm.addEventListener("submit", (event) => {
        event.preventDefault();
        setStatus(elements.openStatus, "Opening…");
        openAndNavigate(elements.openPath.value)
            .then(() => setStatus(elements.openStatus, ""))
            .catch((error: unknown) => {
                setStatus(elements.openStatus, error instanceof Error ? error.message : String(error));
            });
    });

    elements.closeProjectButton.addEventListener("click", () => {
        closeProject(fetchImpl)
            .then(() => {
                navigate("home");
                showView(elements, "home");
                refreshHome();
            })
            .catch((error: unknown) => {
                setStatus(elements.status, error instanceof Error ? error.message : String(error));
            });
    });

    elements.tabOverviewButton.addEventListener("click", () => {
        activeProjectTab = "overview";
        showProjectTab(elements, "overview");
    });

    elements.tabValidationButton.addEventListener("click", () => {
        activeProjectTab = "validation";
        showProjectTab(elements, "validation");
    });

    elements.tabSimulationButton.addEventListener("click", () => {
        activeProjectTab = "simulation";
        showProjectTab(elements, "simulation");
    });

    elements.tabReportsButton.addEventListener("click", () => {
        activeProjectTab = "reports";
        showProjectTab(elements, "reports");
        refreshReports();
    });

    elements.reportsRefreshButton.addEventListener("click", () => {
        refreshReports();
    });

    elements.tabReplayButton.addEventListener("click", () => {
        activeProjectTab = "replay";
        showProjectTab(elements, "replay");
        refreshReplays();
    });

    elements.replayListRefreshButton.addEventListener("click", () => {
        refreshReplays();
    });

    elements.replayForm.addEventListener("submit", (event) => {
        event.preventDefault();
        const round = Number(elements.replayRoundInput.value);
        const seed = elements.replaySeedInput.value.trim();
        runReplayAndRender(round, seed.length > 0 ? seed : undefined);
    });

    elements.replayRerunButton.addEventListener("click", () => {
        if (lastReplayParams === undefined) {
            return;
        }
        runReplayAndRender(lastReplayParams.round, lastReplayParams.seed);
    });

    elements.replayCancelButton.addEventListener("click", () => {
        if (currentReplayId === undefined) {
            return;
        }
        cancelReplay(fetchImpl, currentReplayId)
            .then((job) => renderReplayJob(job))
            .catch((error: unknown) => {
                renderReplayError(elements, error instanceof Error ? error.message : String(error));
            });
    });

    elements.reportBackToSimulationButton.addEventListener("click", () => {
        if (currentReportDetail !== undefined) {
            elements.simulationRoundsInput.value = String(currentReportDetail.requestedRounds);
            elements.simulationSeedInput.value = currentReportDetail.seed ?? "";
        }
        activeProjectTab = "simulation";
        showProjectTab(elements, "simulation");
    });

    elements.simulationViewInReportsButton.addEventListener("click", () => {
        if (currentSimulationId !== undefined) {
            selectReport(currentSimulationId);
            refreshReports();
        }
    });

    elements.inspectButton.addEventListener("click", () => {
        refreshInspect();
    });

    elements.validateQuickActionButton.addEventListener("click", () => {
        activeProjectTab = "validation";
        showProjectTab(elements, "validation");
        runValidate();
    });

    elements.runValidateButton.addEventListener("click", () => {
        runValidate();
    });

    elements.simulationForm.addEventListener("submit", (event) => {
        event.preventDefault();
        const rounds = Number(elements.simulationRoundsInput.value);
        const seed = elements.simulationSeedInput.value.trim();
        runSimulation(rounds, seed.length > 0 ? seed : undefined);
    });

    elements.simulationCancelButton.addEventListener("click", () => {
        if (currentSimulationId === undefined) {
            return;
        }
        cancelSimulation(fetchImpl, currentSimulationId)
            .then((job) => renderSimulationJob(job))
            .catch((error: unknown) => {
                renderSimulationError(elements, error instanceof Error ? error.message : String(error));
            });
    });

    elements.simulationRerunButton.addEventListener("click", () => {
        if (lastSimulationParams === undefined) {
            return;
        }
        runSimulation(lastSimulationParams.rounds, lastSimulationParams.seed);
    });
}

main().catch((error: unknown) => {
    console.error(error);
});
