import {
    buildBlueprint,
    buildProject,
    buildReportDownloadUrl,
    cancelReplay,
    cancelSimulation,
    closeProject,
    createProject,
    createRuntimeSession,
    FetchLike,
    getContext,
    getProjectContext,
    getReplay,
    getReport,
    getRuntimeSession,
    getRuntimeState,
    getSimulation,
    initProject,
    inspectProject,
    listRecentProjects,
    listReplays,
    listReports,
    loadBlueprint,
    openProject,
    previewBlueprintBuild,
    previewBuild,
    previewReelStripGeneration,
    restartRuntime,
    runReplay,
    saveBlueprint,
    spinRuntimeSession,
    startRuntime,
    StartRuntimeOptions,
    startSimulation,
    stopRuntime,
    validateBlueprint,
    validateProject,
} from "./apiClient.js";
import {applyJsonText, BlueprintEditorState, createEmptyBlueprintEditorState, loadBlueprintEditorState, withFieldUpdate} from "./blueprintEditorState.js";
import {confirmDangerousAction} from "./confirmDangerousAction.js";
import {
    addBet,
    addPayline,
    addSymbol,
    resizePaylinesToReelCount,
    resizeReelStripGenerationToReelCount,
    resizeReelStripsToReelCount,
    setPaytablePayout,
    setReelGenerationMode,
    setSymbolWeight,
    type ReelGenerationMode,
} from "./blueprintFormOps.js";
import {
    BlueprintMode,
    BlueprintMutate,
    Elements,
    errorMessage,
    formatTimestamp,
    HomeTab,
    ProjectTab,
    queryElements,
    renderBlueprintBuildPreview,
    renderBlueprintBuildResult,
    renderBlueprintForm,
    renderBlueprintJson,
    renderBlueprintLoadResult,
    renderBlueprintSaveResult,
    renderBlueprintValidation,
    renderBuildPreview,
    renderBuildResult,
    renderCreateResult,
    renderHomeRecentProjects,
    renderHomeRecentProjectsError,
    renderInitResult,
    renderInspectionResult,
    renderProjectHeader,
    renderReelStripGenerationPreview,
    renderReplayError,
    renderReplayList,
    renderReplayListError,
    renderReplayProgress,
    renderReplayResult,
    renderReportDetailState,
    renderReportsList,
    renderReportsListError,
    renderRuntimeHistory,
    renderRuntimeSession,
    renderRuntimeState,
    RuntimeHistoryEntry,
    renderSimulationError,
    renderSimulationProgress,
    renderSimulationReport,
    renderValidationSummary,
    setStatus,
    showBlueprintMode,
    showHomeTab,
    showProjectTab,
    showView,
} from "./dom.js";
import {
    describeLoadResult,
    describeReelStripGenerationPreview,
    describeSaveResult,
    describeValidation,
    isStaleReelStripGenerationRequest,
} from "./interpretBlueprintEditor.js";
import {describeBuildPreview, describeBuildResult, describeRecentProjectsList, describeScaffoldResult} from "./interpretHome.js";
import {describeInspection, describeProjectHeader, describeValidationSummary} from "./interpretProjectDashboard.js";
import {describeReplayList, describeReplayProgress, describeReplayResult, isReplayActive, isReplayTerminal} from "./interpretReplay.js";
import {describeReportsList} from "./interpretReports.js";
import {
    describeRuntimeState,
    describeSessionResult,
    describeSpinResult,
    describeStartResult,
    isRuntimeRunning,
    RuntimeSessionResultView,
    RuntimeSpinResultView,
    RuntimeStateView,
} from "./interpretRuntime.js";
import {describeSimulationProgress, describeSimulationReport, isSimulationActive} from "./interpretSimulation.js";
import {currentRoute, navigate, onRouteChange, StudioRoute} from "./router.js";
import type {
    ProjectDashboardContext,
    SimulationReport,
    StudioContext,
    StudioHomeRecentProjectView,
    StudioReplayJobView,
    StudioSimulationJobView,
} from "./types.js";

function toRecordCopy(value: unknown): Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value) ? {...(value as Record<string, unknown>)} : {};
}

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

async function refreshRecentProjects(
    elements: Elements,
    fetchImpl: FetchLike,
    onOpen: (entry: StudioHomeRecentProjectView) => void,
): Promise<void> {
    const entries = await listRecentProjects(fetchImpl);
    renderHomeRecentProjects(elements, describeRecentProjectsList(entries), onOpen);
}

async function main(): Promise<void> {
    const elements = queryElements();
    const fetchImpl = window.fetch.bind(window) as FetchLike;
    let activeProjectTab: ProjectTab = "overview";
    let activeHomeTab: HomeTab = "recent";
    // The projectRoot of the most recent successful Create/Init/Build result, one per flow — each
    // flow's own "Open in Studio" button reuses the same Home Open action (POST
    // /api/home/projects/open) against this path, rather than transitioning context itself.
    let lastCreatedProjectRoot: string | undefined;
    let lastInitializedProjectRoot: string | undefined;
    let lastBuiltProjectRoot: string | undefined;
    // The outDir a Build actually succeeded against, so re-clicking Build with the *same* outDir can
    // confirm before silently overwriting it — same "remember what's already safely written" pattern as
    // blueprintOverwriteConfirmedForPath below. Never gates a first build against a given outDir.
    let lastBuiltHomeOutDir: string | undefined;

    // The Blueprint Editor's own state — see blueprintEditorState.ts's own doc comment for how
    // `blueprintState` stays the one source of truth Form edits and JSON edits both go through.
    // `blueprintPath` is the last path successfully loaded from or saved to (prefilled into both the
    // Load/Save path inputs and passed as Build/Build Preview's `sourcePath`); once a save to a given
    // path succeeds (or that path was just loaded from), `blueprintOverwriteConfirmedForPath` remembers
    // it so a normal edit-then-resave loop doesn't need to re-confirm the overwrite every time — only a
    // *different* path, or a path this session has never successfully written to, needs confirmation.
    let blueprintState: BlueprintEditorState = createEmptyBlueprintEditorState();
    let blueprintMode: BlueprintMode = "form";
    let blueprintPath: string | undefined;
    let blueprintOverwriteConfirmedForPath: string | undefined;
    let lastBuiltBlueprintProjectRoot: string | undefined;
    // Same reasoning as lastBuiltHomeOutDir above, for the Blueprint Editor's own Build action.
    let lastBuiltBlueprintOutDir: string | undefined;

    const renderBlueprintEditor = (): void => {
        renderBlueprintForm(elements, blueprintState.blueprint, blueprintMutate);
        renderBlueprintJson(elements, blueprintState.jsonText, blueprintState.jsonError);
    };

    const blueprintMutate: BlueprintMutate = (mutate) => {
        blueprintState = withFieldUpdate(blueprintState, mutate);
        // Any edit invalidates a previously shown Reel Strip Modeler preview -- it described the
        // blueprint as it was *before* this change, so it's cleared rather than left showing
        // (now-stale) results next to the just-edited Form/JSON.
        renderReelStripGenerationPreview(elements, {status: "idle"});
        renderBlueprintEditor();
    };

    const setManifestField = (field: "id" | "name" | "version" | "description" | "author", value: string): void => {
        blueprintMutate((b) => {
            const manifest = toRecordCopy(b.manifest);
            if (value.length === 0 && field !== "id" && field !== "name" && field !== "version") {
                Reflect.deleteProperty(manifest, field);
            } else {
                manifest[field] = value;
            }
            b.manifest = manifest;
        });
    };

    const runSaveBlueprint = (overwrite: boolean): void => {
        const path = elements.blueprintSavePath.value;
        saveBlueprint(fetchImpl, path, blueprintState.blueprint, overwrite)
            .then((result) => {
                renderBlueprintSaveResult(elements, describeSaveResult(result));
                if (result.status === "ok") {
                    blueprintPath = result.path;
                    blueprintOverwriteConfirmedForPath = result.path;
                }
            })
            .catch((error: unknown) => {
                renderBlueprintSaveResult(elements, {status: "error", message: errorMessage(error)});
            });
    };

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
                    message: errorMessage(error),
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
                setStatus(elements.validationStatus, errorMessage(error));
            });
    };

    // Tracked so the Cancel/re-run buttons and background polling know which job to act on — reset
    // whenever a (new) project becomes active (see showProjectDashboard below), same as Inspect's own
    // per-project state.
    let currentSimulationId: string | undefined;
    let lastSimulationParams: {rounds: number; seed?: string; workers: number} | undefined;
    // Mirrors the most recently rendered job's isSimulationActive() — cheaper than re-deriving it from
    // the DOM, and used only to gate the Close-project/Open-project confirmation prompts (see
    // confirmDangerousAction.ts) so they fire exclusively when there's actually something to lose.
    let simulationActive = false;
    // The report currently shown in the Reports tab's detail view — kept so "Back to Simulation
    // parameters" can read its rounds/seed without a second fetch.
    let currentReportDetail: SimulationReport | undefined;

    // Tracked so the Cancel/re-run buttons and background polling know which job to act on — reset
    // whenever a (new) project becomes active (see showProjectDashboard below), same as Simulation's
    // own per-project state.
    let currentReplayId: string | undefined;
    let lastReplayParams: {round: number; seed?: string} | undefined;
    // Same reasoning as simulationActive above, mirrored from isReplayActive().
    let replayActive = false;

    // The Runtime tab's own state — reset whenever a (new) project becomes active (see
    // showProjectDashboard below), same reasoning as Simulation/Replay's own per-project state.
    // `currentRuntimeSessionId` is tracked separately from whatever renderRuntimeSession last showed,
    // since Spin/Repeat need it even while a request is in flight (no DOM value to read back from).
    let runtimeState: RuntimeStateView = {status: "idle"};
    let runtimeSessionView: RuntimeSessionResultView | RuntimeSpinResultView = {status: "idle"};
    let currentRuntimeSessionId: string | undefined;
    let lastSpinRequestId: string | undefined;
    let lastSpinExpectedVersion: number | undefined;
    let runtimeHistory: RuntimeHistoryEntry[] = [];
    const RUNTIME_HISTORY_LIMIT = 20;

    const pushRuntimeHistory = (action: string, summary: string): void => {
        runtimeHistory = [{timestamp: formatTimestamp(Date.now()), action, summary}, ...runtimeHistory].slice(0, RUNTIME_HISTORY_LIMIT);
        renderRuntimeHistory(elements, runtimeHistory);
    };

    const refreshRuntimeState = (): void => {
        runtimeState = {status: "loading"};
        renderRuntimeState(elements, runtimeState);
        getRuntimeState(fetchImpl)
            .then((state) => {
                runtimeState = describeRuntimeState(state);
                renderRuntimeState(elements, runtimeState);
            })
            .catch((error: unknown) => {
                runtimeState = {status: "error", message: errorMessage(error)};
                renderRuntimeState(elements, runtimeState);
            });
    };

    const readStartRuntimeOptions = (): StartRuntimeOptions => ({
        host: elements.runtimeHost.value.trim() || undefined,
        port: elements.runtimePort.value.trim() === "" ? undefined : Number(elements.runtimePort.value),
        debug: elements.runtimeDebug.checked,
        repositoryMode: elements.runtimeRepositoryMode.value === "file" ? "file" : "memory",
        seed: elements.runtimeSeed.value.trim() || undefined,
    });

    const runtimeStateSummary = (state: RuntimeStateView): string =>
        state.status === "running" ? `running at ${state.baseUrl}` : state.status;

    // Gates the Close-project/Open-project confirmation prompts (see confirmDangerousAction.ts) — only
    // when the current project actually has something running does leaving it lose in-progress work
    // (project-switch already cancels these server-side, see StudioServer's own project-switch
    // cancellation — this prompt just makes sure that's not a surprise).
    const hasActiveProjectOperation = (): boolean => simulationActive || replayActive || isRuntimeRunning(runtimeState);

    const resetRuntimeSessionView = (): void => {
        currentRuntimeSessionId = undefined;
        runtimeSessionView = {status: "idle"};
        renderRuntimeSession(elements, runtimeSessionView);
    };

    const runRuntimeSpin = (requestId: string | undefined, expectedVersion: number | undefined): void => {
        if (currentRuntimeSessionId === undefined) {
            return;
        }
        lastSpinRequestId = requestId;
        lastSpinExpectedVersion = expectedVersion;
        runtimeSessionView = {status: "loading"};
        renderRuntimeSession(elements, runtimeSessionView);
        spinRuntimeSession(fetchImpl, currentRuntimeSessionId, requestId, expectedVersion)
            .then((result) => {
                runtimeSessionView = describeSpinResult(result);
                renderRuntimeSession(elements, runtimeSessionView);
                pushRuntimeHistory("Spin", result.status === "ok" ? `credits ${result.session.credits}, win ${result.session.win ?? 0}` : result.status);
            })
            .catch((error: unknown) => {
                runtimeSessionView = {status: "error", message: errorMessage(error)};
                renderRuntimeSession(elements, runtimeSessionView);
            });
    };

    const renderSimulationJob = (job: StudioSimulationJobView): void => {
        simulationActive = isSimulationActive(job);
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
                renderReportsListError(elements, errorMessage(error));
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
                    message: errorMessage(error),
                });
            });
    };

    const renderReplayJob = (job: StudioReplayJobView): void => {
        replayActive = isReplayActive(job);
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
                renderReplayListError(elements, errorMessage(error));
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
                renderReplayError(elements, errorMessage(error));
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
                renderReplayError(elements, errorMessage(error));
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
                renderReplayError(elements, errorMessage(error));
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
                renderSimulationError(elements, errorMessage(error));
            });
    };

    const runSimulation = (rounds: number, seed?: string, workers = 1): void => {
        lastSimulationParams = {rounds, seed, workers};
        renderSimulationProgress(elements, {status: "queued", roundsCompleted: 0, rounds, workers, percent: 0, durationMs: 0});
        startSimulation(fetchImpl, rounds, seed, workers)
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
                renderSimulationError(elements, errorMessage(error));
            });
    };

    const showProjectDashboard = (dashboard: ProjectDashboardContext): void => {
        renderProjectHeader(elements, describeProjectHeader(dashboard), activeProjectTab);
        if (dashboard.status === "loaded" || dashboard.status === "error") {
            refreshInspect();
            currentSimulationId = undefined;
            lastSimulationParams = undefined;
            simulationActive = false;
            renderSimulationProgress(elements, undefined);
            elements.simulationReport.container.hidden = true;
            elements.simulationViewInReportsButton.hidden = true;
            currentReportDetail = undefined;
            renderReportDetailState(elements, {status: "empty"});
            refreshReports();
            currentReplayId = undefined;
            lastReplayParams = undefined;
            replayActive = false;
            renderReplayProgress(elements, undefined);
            elements.replayResult.hidden = true;
            refreshReplays();
            resetRuntimeSessionView();
            lastSpinRequestId = undefined;
            lastSpinExpectedVersion = undefined;
            runtimeHistory = [];
            renderRuntimeHistory(elements, runtimeHistory);
            refreshRuntimeState();
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
                setStatus(elements.status, errorMessage(error));
            });
    };

    // Shared by the Open Existing Project form, clicking a Recent Projects entry, and each of
    // Create/Init/Build's own "Open in Studio" buttons — opens `projectRoot` through the API and, on
    // success, switches the app to the Project route (the one explicit Home → Project Studio context
    // transition; see StudioServer.handleHomeOpenProject). Throws on failure so each caller decides how
    // to surface the error in its own tab's error element.
    const openAndNavigate = async (projectRoot: string): Promise<void> => {
        const {context} = await openProject(fetchImpl, projectRoot);
        navigate("project");
        showView(elements, "project");
        if (context.mode === "project") {
            pollProjectDashboard(PROJECT_POLL_MAX_ATTEMPTS);
        }
    };

    const refreshHomeRecentProjects = (): void => {
        refreshRecentProjects(elements, fetchImpl, (entry) => {
            openAndNavigate(entry.projectRoot).catch((error: unknown) => {
                renderHomeRecentProjectsError(elements, errorMessage(error));
            });
        }).catch((error: unknown) => {
            renderHomeRecentProjectsError(elements, errorMessage(error));
        });
    };

    // Refreshing Home only ever means refreshing its Recent Projects list — Create/Init/Build/Open are
    // one-shot forms with no data of their own to load, same reasoning as the Project Dashboard's own
    // per-tab refreshes in showProjectDashboard. Restores whichever tab was last active (same
    // "remembers the active tab across a reload" convention as renderProjectHeader/activeProjectTab).
    const refreshHome = (): void => {
        showHomeTab(elements, activeHomeTab);
        refreshHomeRecentProjects();
    };

    const runCreateProject = (): void => {
        renderCreateResult(elements, {status: "loading"});
        createProject(fetchImpl, {
            destinationDir: elements.homeCreateDestination.value,
            name: elements.homeCreateName.value,
            gameId: elements.homeCreateGameId.value.trim() || undefined,
            gameName: elements.homeCreateGameName.value.trim() || undefined,
            version: elements.homeCreateVersion.value.trim() || undefined,
        })
            .then((result) => {
                renderCreateResult(elements, describeScaffoldResult(result));
                if (result.status === "ok") {
                    lastCreatedProjectRoot = result.projectRoot;
                    refreshHomeRecentProjects();
                }
            })
            .catch((error: unknown) => {
                renderCreateResult(elements, {status: "error", message: errorMessage(error)});
            });
    };

    const runInitProject = (): void => {
        renderInitResult(elements, {status: "loading"});
        initProject(fetchImpl, {directory: elements.homeInitDirectory.value})
            .then((result) => {
                renderInitResult(elements, describeScaffoldResult(result));
                if (result.status === "ok") {
                    lastInitializedProjectRoot = result.projectRoot;
                    refreshHomeRecentProjects();
                }
            })
            .catch((error: unknown) => {
                renderInitResult(elements, {status: "error", message: errorMessage(error)});
            });
    };

    const runBuildPreview = (): void => {
        renderBuildPreview(elements, {status: "loading"});
        previewBuild(fetchImpl, {
            blueprintPath: elements.homeBuildBlueprintPath.value,
            outDir: elements.homeBuildOutDir.value.trim() || undefined,
        })
            .then((preview) => {
                renderBuildPreview(elements, describeBuildPreview(preview));
            })
            .catch((error: unknown) => {
                renderBuildPreview(elements, {status: "error", message: errorMessage(error)});
            });
    };

    const runBuildProject = (): void => {
        const outDir = elements.homeBuildOutDir.value.trim() || undefined;
        renderBuildResult(elements, {status: "loading"});
        buildProject(fetchImpl, {
            blueprintPath: elements.homeBuildBlueprintPath.value,
            outDir,
        })
            .then((result) => {
                renderBuildResult(elements, describeBuildResult(result));
                if (result.status === "ok") {
                    lastBuiltProjectRoot = result.projectRoot;
                    lastBuiltHomeOutDir = outDir;
                    refreshHomeRecentProjects();
                }
            })
            .catch((error: unknown) => {
                renderBuildResult(elements, {status: "error", message: errorMessage(error)});
            });
    };

    renderBlueprintEditor();
    showBlueprintMode(elements, blueprintMode);

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
        setStatus(elements.status, errorMessage(error));
        return;
    }

    // Fires for *any* hash change, in-app navigate() calls and the browser's own Back/Forward alike —
    // the two are indistinguishable at this level (see router.ts's own doc comment), which matters
    // specifically for the transition to "home": Back from the Project route lands here too, not just
    // the explicit Close-project button (main.ts's own click handler below already calls closeProject()
    // itself before navigating, so this fires a second, harmless, idempotent call in that case — see
    // POST /api/projects/close's own doc comment). Without this, Back would flip the *client* to Home
    // while the *server* stayed in "project" mode indefinitely — its runtime server (if any) still
    // holding its OS port, unseen. Errors are swallowed: this is a best-effort background sync, not a
    // user-initiated action with its own error UI to report through.
    onRouteChange((route) => {
        showView(elements, route);
        if (route === "home") {
            activeProjectTab = "overview";
            closeProject(fetchImpl).catch(() => undefined);
            refreshHome();
        } else {
            pollProjectDashboard(PROJECT_POLL_MAX_ATTEMPTS);
        }
    });

    elements.homeTabRecentButton.addEventListener("click", () => {
        activeHomeTab = "recent";
        showHomeTab(elements, "recent");
        refreshHomeRecentProjects();
    });

    elements.homeTabCreateButton.addEventListener("click", () => {
        activeHomeTab = "create";
        showHomeTab(elements, "create");
    });

    elements.homeTabInitButton.addEventListener("click", () => {
        activeHomeTab = "init";
        showHomeTab(elements, "init");
    });

    elements.homeTabBuildButton.addEventListener("click", () => {
        activeHomeTab = "build";
        showHomeTab(elements, "build");
    });

    elements.homeTabOpenButton.addEventListener("click", () => {
        activeHomeTab = "open";
        showHomeTab(elements, "open");
    });

    elements.homeRecentRefreshButton.addEventListener("click", () => {
        refreshHomeRecentProjects();
    });

    elements.homeCreateForm.addEventListener("submit", (event) => {
        event.preventDefault();
        runCreateProject();
    });

    elements.homeCreateOpenButton.addEventListener("click", () => {
        if (lastCreatedProjectRoot === undefined) {
            return;
        }
        openAndNavigate(lastCreatedProjectRoot).catch((error: unknown) => {
            renderCreateResult(elements, {status: "error", message: errorMessage(error)});
        });
    });

    elements.homeInitForm.addEventListener("submit", (event) => {
        event.preventDefault();
        runInitProject();
    });

    elements.homeInitOpenButton.addEventListener("click", () => {
        if (lastInitializedProjectRoot === undefined) {
            return;
        }
        openAndNavigate(lastInitializedProjectRoot).catch((error: unknown) => {
            renderInitResult(elements, {status: "error", message: errorMessage(error)});
        });
    });

    elements.homeBuildForm.addEventListener("submit", (event) => {
        event.preventDefault();
        runBuildPreview();
    });

    elements.homeBuildRunButton.addEventListener("click", () => {
        const outDir = elements.homeBuildOutDir.value.trim() || undefined;
        if (lastBuiltHomeOutDir !== undefined && lastBuiltHomeOutDir === outDir) {
            const target = outDir ?? "the default output directory";
            if (!confirmDangerousAction(`A package was already built at "${target}" this session. Rebuild and overwrite it?`)) {
                return;
            }
        }
        runBuildProject();
    });

    elements.homeBuildOpenButton.addEventListener("click", () => {
        if (lastBuiltProjectRoot === undefined) {
            return;
        }
        openAndNavigate(lastBuiltProjectRoot).catch((error: unknown) => {
            renderBuildResult(elements, {status: "error", message: errorMessage(error)});
        });
    });

    elements.homeTabBlueprintEditorButton.addEventListener("click", () => {
        activeHomeTab = "blueprint-editor";
        showHomeTab(elements, "blueprint-editor");
        renderBlueprintEditor();
    });

    elements.blueprintModeFormButton.addEventListener("click", () => {
        blueprintMode = "form";
        showBlueprintMode(elements, blueprintMode);
    });

    elements.blueprintModeJsonButton.addEventListener("click", () => {
        blueprintMode = "json";
        showBlueprintMode(elements, blueprintMode);
    });

    elements.blueprintNewButton.addEventListener("click", () => {
        blueprintState = createEmptyBlueprintEditorState();
        blueprintPath = undefined;
        blueprintOverwriteConfirmedForPath = undefined;
        elements.blueprintLoadPath.value = "";
        elements.blueprintSavePath.value = "";
        renderBlueprintLoadResult(elements, {status: "idle"});
        renderBlueprintSaveResult(elements, {status: "idle"});
        renderBlueprintValidation(elements, {status: "idle"});
        renderReelStripGenerationPreview(elements, {status: "idle"});
        renderBlueprintBuildPreview(elements, {status: "idle"});
        renderBlueprintBuildResult(elements, {status: "idle"});
        renderBlueprintEditor();
    });

    elements.blueprintLoadButton.addEventListener("click", () => {
        loadBlueprint(fetchImpl, elements.blueprintLoadPath.value)
            .then((result) => {
                renderBlueprintLoadResult(elements, describeLoadResult(result));
                if (result.status === "ok") {
                    blueprintState = loadBlueprintEditorState(result.blueprint);
                    blueprintPath = result.path;
                    blueprintOverwriteConfirmedForPath = result.path;
                    elements.blueprintSavePath.value = result.path;
                    renderBlueprintEditor();
                }
            })
            .catch((error: unknown) => {
                renderBlueprintLoadResult(elements, {status: "error", message: errorMessage(error)});
            });
    });

    elements.blueprintSaveButton.addEventListener("click", () => {
        runSaveBlueprint(blueprintOverwriteConfirmedForPath === elements.blueprintSavePath.value);
    });

    elements.blueprintSaveOverwriteButton.addEventListener("click", () => {
        if (!confirmDangerousAction(`Overwrite the blueprint at "${elements.blueprintSavePath.value}"?`)) {
            return;
        }
        runSaveBlueprint(true);
    });

    elements.blueprintJsonApplyButton.addEventListener("click", () => {
        blueprintState = applyJsonText(blueprintState, elements.blueprintJsonTextarea.value);
        renderReelStripGenerationPreview(elements, {status: "idle"});
        renderBlueprintEditor();
    });

    elements.blueprintFieldId.addEventListener("change", () => setManifestField("id", elements.blueprintFieldId.value));
    elements.blueprintFieldName.addEventListener("change", () => setManifestField("name", elements.blueprintFieldName.value));
    elements.blueprintFieldVersion.addEventListener("change", () => setManifestField("version", elements.blueprintFieldVersion.value));
    elements.blueprintFieldDescription.addEventListener("change", () =>
        setManifestField("description", elements.blueprintFieldDescription.value),
    );
    elements.blueprintFieldAuthor.addEventListener("change", () => setManifestField("author", elements.blueprintFieldAuthor.value));

    elements.blueprintFieldReels.addEventListener("change", () => {
        blueprintMutate((b) => {
            b.reels = elements.blueprintFieldReels.valueAsNumber;
            resizePaylinesToReelCount(b);
            resizeReelStripsToReelCount(b);
            resizeReelStripGenerationToReelCount(b);
        });
    });

    elements.blueprintFieldRows.addEventListener("change", () => {
        blueprintMutate((b) => {
            b.rows = elements.blueprintFieldRows.valueAsNumber;
        });
    });

    elements.blueprintAddSymbolButton.addEventListener("click", () => {
        const id = elements.blueprintAddSymbolInput.value.trim();
        if (id.length === 0) {
            return;
        }
        blueprintMutate((b) => addSymbol(b, id));
        elements.blueprintAddSymbolInput.value = "";
    });

    elements.blueprintAddBetButton.addEventListener("click", () => {
        const value = elements.blueprintAddBetInput.valueAsNumber;
        if (Number.isNaN(value)) {
            return;
        }
        blueprintMutate((b) => addBet(b, value));
        elements.blueprintAddBetInput.value = "";
    });

    elements.blueprintAddPaylineButton.addEventListener("click", () => {
        blueprintMutate((b) => addPayline(b));
    });

    elements.blueprintAddPaytableButton.addEventListener("click", () => {
        const symbolId = elements.blueprintAddPaytableSymbol.value;
        const matchCount = elements.blueprintAddPaytableMatchCount.valueAsNumber;
        const payout = elements.blueprintAddPaytablePayout.valueAsNumber;
        if (symbolId.length === 0 || Number.isNaN(matchCount) || Number.isNaN(payout)) {
            return;
        }
        blueprintMutate((b) => setPaytablePayout(b, symbolId, matchCount, payout));
    });

    elements.blueprintAddWeightButton.addEventListener("click", () => {
        const symbolId = elements.blueprintAddWeightSymbol.value;
        const weight = elements.blueprintAddWeightValue.valueAsNumber;
        if (symbolId.length === 0 || Number.isNaN(weight)) {
            return;
        }
        blueprintMutate((b) => setSymbolWeight(b, symbolId, weight));
    });

    const setBlueprintGenerationMode = (mode: ReelGenerationMode): void => {
        blueprintMutate((b) => setReelGenerationMode(b, mode));
    };
    elements.blueprintModeDefaultRadio.addEventListener("change", () => setBlueprintGenerationMode("default"));
    elements.blueprintModeReelStripsRadio.addEventListener("change", () => setBlueprintGenerationMode("reelStrips"));
    elements.blueprintModeReelStripGenerationRadio.addEventListener("change", () => setBlueprintGenerationMode("reelStripGeneration"));
    elements.blueprintModeWeightsRadio.addEventListener("change", () => setBlueprintGenerationMode("symbolWeights"));

    elements.blueprintReelStripGenerationResolveButton.addEventListener("click", () => {
        // Captured now, before the request goes out -- if the blueprint changes (another edit, a
        // New/Load) before this response comes back, blueprintState.version will have moved on by
        // then, and the response is dropped as stale rather than clobbering whatever's now showing.
        const requestedVersion = blueprintState.version;
        renderReelStripGenerationPreview(elements, {status: "loading"});
        previewReelStripGeneration(fetchImpl, blueprintState.blueprint)
            .then((result) => {
                if (isStaleReelStripGenerationRequest(requestedVersion, blueprintState.version)) {
                    return;
                }
                renderReelStripGenerationPreview(elements, describeReelStripGenerationPreview(result));
            })
            .catch((error: unknown) => {
                if (isStaleReelStripGenerationRequest(requestedVersion, blueprintState.version)) {
                    return;
                }
                renderReelStripGenerationPreview(elements, {status: "error", message: errorMessage(error)});
            });
    });

    elements.blueprintValidateButton.addEventListener("click", () => {
        renderBlueprintValidation(elements, {status: "loading"});
        validateBlueprint(fetchImpl, blueprintState.blueprint)
            .then((result) => {
                renderBlueprintValidation(elements, describeValidation(result));
            })
            .catch((error: unknown) => {
                renderBlueprintValidation(elements, {status: "error", message: errorMessage(error)});
            });
    });

    elements.blueprintBuildPreviewButton.addEventListener("click", () => {
        renderBlueprintBuildPreview(elements, {status: "loading"});
        previewBlueprintBuild(fetchImpl, blueprintState.blueprint, elements.blueprintOutDir.value.trim() || undefined, blueprintPath)
            .then((preview) => {
                renderBlueprintBuildPreview(elements, describeBuildPreview(preview));
            })
            .catch((error: unknown) => {
                renderBlueprintBuildPreview(elements, {status: "error", message: errorMessage(error)});
            });
    });

    elements.blueprintBuildButton.addEventListener("click", () => {
        const outDir = elements.blueprintOutDir.value.trim() || undefined;
        if (lastBuiltBlueprintOutDir !== undefined && lastBuiltBlueprintOutDir === outDir) {
            const target = outDir ?? "the default output directory";
            if (!confirmDangerousAction(`A package was already built at "${target}" this session. Rebuild and overwrite it?`)) {
                return;
            }
        }
        renderBlueprintBuildResult(elements, {status: "loading"});
        buildBlueprint(fetchImpl, blueprintState.blueprint, outDir, blueprintPath)
            .then((result) => {
                renderBlueprintBuildResult(elements, describeBuildResult(result));
                if (result.status === "ok") {
                    lastBuiltBlueprintProjectRoot = result.projectRoot;
                    lastBuiltBlueprintOutDir = outDir;
                    refreshHomeRecentProjects();
                }
            })
            .catch((error: unknown) => {
                renderBlueprintBuildResult(elements, {status: "error", message: errorMessage(error)});
            });
    });

    elements.blueprintBuildOpenButton.addEventListener("click", () => {
        if (lastBuiltBlueprintProjectRoot === undefined) {
            return;
        }
        openAndNavigate(lastBuiltBlueprintProjectRoot).catch((error: unknown) => {
            renderBlueprintBuildResult(elements, {status: "error", message: errorMessage(error)});
        });
    });

    elements.homeOpenForm.addEventListener("submit", (event) => {
        event.preventDefault();
        elements.homeOpenLoading.hidden = false;
        elements.homeOpenError.hidden = true;
        openAndNavigate(elements.homeOpenPath.value).catch((error: unknown) => {
            elements.homeOpenLoading.hidden = true;
            elements.homeOpenError.hidden = false;
            elements.homeOpenError.textContent = errorMessage(error);
        });
    });

    elements.closeProjectButton.addEventListener("click", () => {
        // The only reachable "leave a project with something running" gate: every Open action lives in
        // the Home view, which is only ever shown after a close already happened (explicit, here, or via
        // Back — see onRouteChange's own "home" branch), so by the time an Open button is clickable
        // hasActiveProjectOperation() is already back to false. This is the one real decision point.
        if (hasActiveProjectOperation() && !confirmDangerousAction("This project has an active simulation, replay, or running runtime. Close the project anyway?")) {
            return;
        }
        closeProject(fetchImpl)
            .then(() => {
                navigate("home");
                showView(elements, "home");
                refreshHome();
            })
            .catch((error: unknown) => {
                setStatus(elements.status, errorMessage(error));
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

    elements.tabRuntimeButton.addEventListener("click", () => {
        activeProjectTab = "runtime";
        showProjectTab(elements, "runtime");
        refreshRuntimeState();
    });

    elements.runtimeStartForm.addEventListener("submit", (event) => {
        event.preventDefault();
        const options = readStartRuntimeOptions();
        runtimeState = {status: "loading"};
        renderRuntimeState(elements, runtimeState);
        startRuntime(fetchImpl, options)
            .then((result) => {
                runtimeState = describeStartResult(result);
                renderRuntimeState(elements, runtimeState);
                pushRuntimeHistory("Start", runtimeStateSummary(runtimeState));
            })
            .catch((error: unknown) => {
                runtimeState = {status: "error", message: errorMessage(error)};
                renderRuntimeState(elements, runtimeState);
            });
    });

    elements.runtimeStopButton.addEventListener("click", () => {
        if (!confirmDangerousAction("Stop the running runtime server?")) {
            return;
        }
        stopRuntime(fetchImpl)
            .then((state) => {
                runtimeState = describeRuntimeState(state);
                renderRuntimeState(elements, runtimeState);
                pushRuntimeHistory("Stop", runtimeStateSummary(runtimeState));
                resetRuntimeSessionView();
            })
            .catch((error: unknown) => {
                runtimeState = {status: "error", message: errorMessage(error)};
                renderRuntimeState(elements, runtimeState);
            });
    });

    elements.runtimeRestartButton.addEventListener("click", () => {
        const options = readStartRuntimeOptions();
        runtimeState = {status: "loading"};
        renderRuntimeState(elements, runtimeState);
        restartRuntime(fetchImpl, options)
            .then((state) => {
                runtimeState = describeRuntimeState(state);
                renderRuntimeState(elements, runtimeState);
                pushRuntimeHistory("Restart", runtimeStateSummary(runtimeState));
                resetRuntimeSessionView();
            })
            .catch((error: unknown) => {
                runtimeState = {status: "error", message: errorMessage(error)};
                renderRuntimeState(elements, runtimeState);
            });
    });

    elements.runtimeCreateSessionButton.addEventListener("click", () => {
        const seed = elements.runtimeCreateSeed.value.trim() || undefined;
        runtimeSessionView = {status: "loading"};
        renderRuntimeSession(elements, runtimeSessionView);
        createRuntimeSession(fetchImpl, seed)
            .then((result) => {
                runtimeSessionView = describeSessionResult(result);
                renderRuntimeSession(elements, runtimeSessionView);
                currentRuntimeSessionId = result.status === "ok" ? result.session.sessionId : undefined;
                pushRuntimeHistory("Create Session", result.status === "ok" ? `session ${result.session.sessionId}` : result.status);
            })
            .catch((error: unknown) => {
                runtimeSessionView = {status: "error", message: errorMessage(error)};
                renderRuntimeSession(elements, runtimeSessionView);
            });
    });

    elements.runtimeLoadSessionButton.addEventListener("click", () => {
        const sessionId = elements.runtimeLoadSessionId.value.trim();
        if (!sessionId) {
            return;
        }
        runtimeSessionView = {status: "loading"};
        renderRuntimeSession(elements, runtimeSessionView);
        getRuntimeSession(fetchImpl, sessionId)
            .then((result) => {
                runtimeSessionView = describeSessionResult(result);
                renderRuntimeSession(elements, runtimeSessionView);
                currentRuntimeSessionId = result.status === "ok" ? result.session.sessionId : undefined;
                pushRuntimeHistory("Load Session", result.status === "ok" ? `session ${result.session.sessionId}` : result.status);
            })
            .catch((error: unknown) => {
                runtimeSessionView = {status: "error", message: errorMessage(error)};
                renderRuntimeSession(elements, runtimeSessionView);
            });
    });

    elements.runtimeSpinForm.addEventListener("submit", (event) => {
        event.preventDefault();
        const requestId = elements.runtimeSpinRequestId.value.trim() || undefined;
        const expectedVersionRaw = elements.runtimeSpinExpectedVersion.value.trim();
        const expectedVersion = expectedVersionRaw === "" ? undefined : Number(expectedVersionRaw);
        runRuntimeSpin(requestId, expectedVersion);
    });

    elements.runtimeRepeatSpinButton.addEventListener("click", () => {
        runRuntimeSpin(lastSpinRequestId, lastSpinExpectedVersion);
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
        if (!confirmDangerousAction("Cancel the running replay?")) {
            return;
        }
        cancelReplay(fetchImpl, currentReplayId)
            .then((job) => renderReplayJob(job))
            .catch((error: unknown) => {
                renderReplayError(elements, errorMessage(error));
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
        const workers = Number(elements.simulationWorkersInput.value);
        runSimulation(rounds, seed.length > 0 ? seed : undefined, workers);
    });

    elements.simulationCancelButton.addEventListener("click", () => {
        if (currentSimulationId === undefined) {
            return;
        }
        if (!confirmDangerousAction("Cancel the running simulation?")) {
            return;
        }
        cancelSimulation(fetchImpl, currentSimulationId)
            .then((job) => renderSimulationJob(job))
            .catch((error: unknown) => {
                renderSimulationError(elements, errorMessage(error));
            });
    });

    elements.simulationRerunButton.addEventListener("click", () => {
        if (lastSimulationParams === undefined) {
            return;
        }
        runSimulation(lastSimulationParams.rounds, lastSimulationParams.seed, lastSimulationParams.workers);
    });
}

main().catch((error: unknown) => {
    console.error(error);
});
