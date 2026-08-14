import {Anchor, Button, Text, Title} from "@mantine/core";
import {useDocumentTitle} from "@mantine/hooks";
import {useCallback, useEffect, useLayoutEffect, useRef, useState} from "react";
import {useNavigate, useParams} from "react-router-dom";
import {
    buildReportDownloadUrl,
    closeProject,
    getReplay,
    getReport,
    inspectReplayArtifact,
    listRecentSpins,
    listReplays,
    listReports,
    validateProject,
} from "../../api/apiClient";
import type {RoundArtifactJson, StudioProjectCapability, StudioSimulationReportListEntry} from "../../api/types";
import {useStudioApi} from "../../context/StudioApiProvider";
import {errorMessage} from "../../domain/errorMessage";
import {
    BLUEPRINT_BUILD_CAPABILITY,
    describeCapability,
    describeValidationSummary,
    OUTCOME_LIBRARY_READ_CAPABILITY,
    OUTCOME_SOURCE_SAMPLE_CAPABILITY,
    PROJECT_TYPE_LABEL,
    RUNTIME_EXECUTE_CAPABILITY,
    STAKE_ADAPTER_EXCHANGE_CAPABILITY,
    type ProjectHeaderView,
    type ProjectValidationView,
} from "../../domain/interpret/ProjectDashboard";
import {describeReplayComparison, describeReplayList, describeReplayResult, isReplayActive, type ReplayListView} from "../../domain/interpret/Replay";
import {describeReportsList, type ReportListView} from "../../domain/interpret/Reports";
import {describeRecentSpinsList, type RecentSpinsListView} from "../../domain/interpret/Runtime";
import {describeSimulationReport, isSimulationActive} from "../../domain/interpret/Simulation";
import {describeReplayActionError} from "../../domain/replayActionError";
import {useConfirm} from "../../hooks/useConfirm";
import {useDeploymentManager} from "../../hooks/useDeploymentManager";
import {useDoubleSubmitGuard} from "../../hooks/useDoubleSubmitGuard";
import {usePlaySession} from "../../hooks/usePlaySession";
import {useProjectContext} from "../../hooks/useProjectContext";
import {useReplayPoll} from "../../hooks/useReplayPoll";
import {useSimulationPoll} from "../../hooks/useSimulationPoll";
import {ErrorState} from "../common/ErrorState";
import {LoadingState} from "../common/LoadingState";
import {AppShellLayout} from "../layout/AppShellLayout";
import {NavTabs, type NavTabItem} from "../layout/NavTabs";
import {CertificationTab} from "./CertificationTab";
import {ExportDeployTab} from "./ExportDeployTab";
import {GameModelTab} from "./GameModelTab";
import {OutcomeSourceOverview} from "./OutcomeSourceOverview";
import {OverviewTab} from "./OverviewTab";
import {PlayTab} from "./PlayTab";
import {ProvablyFairTab} from "./ProvablyFairTab";
import {ReplayTab, type ExpectedReplayState} from "./ReplayTab";
import {SimulationTab, type ReportDetailState} from "./SimulationTab";

export type ProjectTab =
    | "overview"
    | "gameModel"
    | "play"
    | "simulation"
    | "replay"
    | "exportDeploy"
    | "certification"
    | "provablyFair";

// Every runtime operation (Simulation/Replay/Certification/Fairness/Build-Export/Analysis) needs
// the loaded project to actually be runnable in-process. A "tsPackage" project carries
// RUNTIME_EXECUTE_CAPABILITY itself; a "blueprint" project never does (see RUNTIME_EXECUTE_CAPABILITY's
// own doc comment), but Studio always materializes it into a runnable tsPackage before loading it, so
// BLUEPRINT_BUILD_CAPABILITY is an equally sufficient signal here -- either one unlocks this whole group.
const RUNTIME_CAPABLE_CAPABILITIES: StudioProjectCapability[] = [BLUEPRINT_BUILD_CAPABILITY, RUNTIME_EXECUTE_CAPABILITY];

// Play/Simulation/Replay each reach a resolved "outcomeLibrary" project through its own real OutcomeSource
// adapters (StudioPlayService/StudioSimulationService/StudioReplayExecutionService), never loadPokieGame --
// see OUTCOME_SOURCE_SAMPLE_CAPABILITY's own doc comment. Added to (never replacing) RUNTIME_CAPABLE_CAPABILITIES
// so a runtime-executable project keeps reaching these sections exactly as before.
const OUTCOME_SOURCE_SAMPLE_CAPABLE_CAPABILITIES: StudioProjectCapability[] = [...RUNTIME_CAPABLE_CAPABILITIES, OUTCOME_SOURCE_SAMPLE_CAPABILITY];

// What Build/Export needs to be reachable at all -- either runtime-executable (able to generate/build/export
// its own outputs) or already *is* a canonical outcome-source project ExportDeployTargets.ts's own capability-
// driven cards already know how to read from (OUTCOME_LIBRARY_READ_CAPABILITY: republish/export an existing
// native library; STAKE_ADAPTER_EXCHANGE_CAPABILITY: republish an existing Stake Engine export) -- see that
// module's own canReachCanonicalOutcomeLibrary/describeExportDeployTargetCards.
const BUILD_EXPORT_CAPABLE_CAPABILITIES: StudioProjectCapability[] = [
    ...RUNTIME_CAPABLE_CAPABILITIES,
    OUTCOME_LIBRARY_READ_CAPABILITY,
    STAKE_ADAPTER_EXCHANGE_CAPABILITY,
];

// Certification builds/verifies an evidence bundle on top of an already-computed native outcome library --
// what CERTIFICATION_BUILD_OPERATION/CERTIFICATION_VERIFY_OPERATION require (OUTCOME_LIBRARY_READ_CAPABILITY),
// same reasoning as Build/Export's own outcome-library card. Never offered for a "stakeAdapter" export, which
// has no PreGeneratedOutcomeSourcing-style draw contract of its own to sample from.
const CERTIFICATION_CAPABLE_CAPABILITIES: StudioProjectCapability[] = [...RUNTIME_CAPABLE_CAPABILITIES, OUTCOME_LIBRARY_READ_CAPABILITY];

type ProjectTabDescriptor = NavTabItem<ProjectTab> & {
    // undefined -- always reachable once a project is loaded (Overview). A non-empty list -- reachable
    // only once the loaded project's own resolved capabilities include at least one of them.
    requiredCapabilities?: StudioProjectCapability[];
};

// The full vocabulary of Project Dashboard sections, in the order the capability-driven nav below
// picks from -- there is no standalone "Validate" section any more: validation is now automatic
// diagnostics folded into Overview itself (see OverviewTab), run on load and re-run on demand, not a
// separate click-to-check tab. Every entry but Overview/Game Model carries `requiredCapabilities` --
// what actually decides whether it's offered (see isTabSupported below), never just "the dashboard
// loaded at all". Replay/Certification/Fairness/Build-Export are tagged `section: "Advanced"`
// so NavTabs visually separates them from the primary Overview -> Play -> Simulation flow --
// everything's still one click away, just not presented as equal-weight to it.
//
// "gameModel"/GameModelTab has no `requiredCapabilities`, same as Overview -- it's a View Mode reading
// of GET /api/project/gameModel's own resolved-project-type-aware projection (see buildProjectGameModel's
// own doc comment), which is meaningful (if only to truthfully report "not available") for every loaded
// project type, not gated behind BLUEPRINT_BUILD_CAPABILITY/RUNTIME_EXECUTE_CAPABILITY the way the
// runtime-operation tabs below are.
//
// "play"/PlayTab is Studio's own -- and only -- game mode -- materializes/loads the project as needed
// and creates a real session directly in Studio's own backend, no server/host/port/API to set up. It's
// deliberately ungrouped (not "Advanced") alongside Overview/Simulation: playing the game is the primary
// thing a project workspace is for. Also reachable for a resolved "outcomeLibrary" project (see
// OUTCOME_SOURCE_SAMPLE_CAPABLE_CAPABILITIES) -- StudioPlayService already plays it through its own real
// OutcomeLibraryBundleOutcomeSource adapter.
//
// "exportDeploy"/ExportDeployTab (labeled "Build/Export") is the sole Studio build surface -- the old
// standalone Deployment/Stake Engine Export/Outcome Libraries workspaces (each its own Stepper-driven
// workflow) have been removed outright, not redirected: every builder they used to own is one of
// Build/Export's own cards (see ExportDeployTargets.ts) except Outcome Libraries' own select-an-existing-
// library/inspect/compare tools, which have no Build/Export equivalent yet -- only generating a fresh
// library does. A deep link to one of the old routes now simply falls back to Overview (see
// isProjectTab/activeTab below) like any other unrecognized tab value, rather than being kept alive
// merely for pre-release compatibility. Also reachable for a resolved "outcomeLibrary"/"stakeAdapter"
// project (see BUILD_EXPORT_CAPABLE_CAPABILITIES) -- neither can generate a fresh library, but each can
// still republish/export the canonical outcome source it already is.
//
// "overview" carries no `requiredCapabilities` -- it's always reachable once a project is loaded, but its
// own *content* still varies by resolved type (OverviewTab for a "loaded" project; OutcomeSourceOverview's
// own canonical reader/analysis/draw for an "outcome-source" one) -- see the render tree below, never a
// second, capability-gated tab of its own.
const ALL_PROJECT_TABS: ProjectTabDescriptor[] = [
    {value: "overview", label: "Overview"},
    {value: "gameModel", label: "Game Model"},
    {value: "play", label: "Play", requiredCapabilities: OUTCOME_SOURCE_SAMPLE_CAPABLE_CAPABILITIES},
    {value: "simulation", label: "Simulation", requiredCapabilities: OUTCOME_SOURCE_SAMPLE_CAPABLE_CAPABILITIES},
    {value: "replay", label: "Replay", section: "Advanced", requiredCapabilities: OUTCOME_SOURCE_SAMPLE_CAPABLE_CAPABILITIES},
    {value: "exportDeploy", label: "Build/Export", section: "Advanced", requiredCapabilities: BUILD_EXPORT_CAPABLE_CAPABILITIES},
    {value: "certification", label: "Certification", section: "Advanced", requiredCapabilities: CERTIFICATION_CAPABLE_CAPABILITIES},
    {value: "provablyFair", label: "Fairness", section: "Advanced", requiredCapabilities: RUNTIME_CAPABLE_CAPABILITIES},
];

function isProjectTab(value: string | undefined): value is ProjectTab {
    return ALL_PROJECT_TABS.some((tab) => tab.value === value);
}

// A route with a project root must remount the dashboard when browser history changes that root.
// ProjectDashboardPage owns several long-lived runtime hooks, and retaining an A instance while the
// server has already switched to B would leave A's session/run identifiers actionable against B.
export function ProjectDashboardRoute() {
    const {projectRoot} = useParams<{projectRoot: string}>();
    return <ProjectDashboardPage key={projectRoot ?? "current-project"} requestedProjectRoot={projectRoot} />;
}

// Legacy `/project/:tab` links contain no project identity. Resolve the server's current project
// in this deliberately state-free route first, then scope its *native* history entry before the
// dashboard (and its session/run/error state) can mount. This makes every rendered project dashboard
// derive from a project-scoped route, including direct links from older Studio versions.
export function LegacyProjectDashboardRoute() {
    const {tab} = useParams<{tab: string}>();
    const navigate = useNavigate();
    const header = useProjectContext();
    const activeTab = isProjectTab(tab) ? tab : "overview";
    const upgradeStartedRef = useRef(false);

    // Let createHashRouter replace the current entry as one of its own transitions. Mutating native
    // history and then synthesizing a zero-distance pop leaves the router with a history update it
    // did not perform; when this entry is later restored by Back, that stale transition can consume
    // the Forward branch. The stateful dashboard cannot mount until the route is project-scoped.
    const projectRoot = header.status === "empty" ? undefined : header.projectRoot;
    useLayoutEffect(() => {
        if (!upgradeStartedRef.current && projectRoot !== undefined && projectRoot !== "") {
            upgradeStartedRef.current = true;
            const scopedPath = `/project/${encodeURIComponent(projectRoot)}/${activeTab}`;
            navigate(scopedPath, {replace: true});
        }
    }, [activeTab, navigate, projectRoot]);

    if (header.status === "error" && projectRoot === "") {
        return <ErrorState message={header.message} detail={header.errorDetail} />;
    }

    return <LoadingState label="Resolving project…" />;
}

// Whether `tab` is actually reachable for the loaded project. A tab with no `requiredCapabilities`
// (Overview) is always supported; everything else needs the project to be resolved -- "loaded" or
// "outcome-source" alike, the only two ProjectHeaderView statuses that carry a `capabilities` array at
// all ("loading"/"error"/"empty" have none to check) -- and to carry at least one of the capabilities
// it lists. Treating "outcome-source" the same as "loaded" here is what makes a resolved "outcomeLibrary"/
// "stakeAdapter" project reach the same capability-gated tab set every other project type does, rather
// than a special-cased page of its own.
function isTabSupported(tab: ProjectTabDescriptor, header: ProjectHeaderView): boolean {
    if (tab.requiredCapabilities === undefined) {
        return true;
    }
    return (
        (header.status === "loaded" || header.status === "outcome-source") &&
        tab.requiredCapabilities.some((capability) => header.capabilities.includes(capability))
    );
}

// The nav items NavTabs actually renders -- filtered solely by isTabSupported above (a project that
// isn't actually runnable has nothing for a runtime-dependent section to show).
function visibleProjectTabs(header: ProjectHeaderView): NavTabItem<ProjectTab>[] {
    return ALL_PROJECT_TABS.filter((tab) => isTabSupported(tab, header));
}

// The explicit diagnostic a deep link to an unsupported operation shows instead of ever mounting that
// tab's own workflow component (see the render tree below) -- mirrors
// describeUnsupportedProjectOperation's own "missing capability" framing (see src/project/
// describeUnsupportedProjectOperation.ts) but for a frontend tab rather than a PokieOperation, since
// studio-client has no dependency on that package (same convention as BLUEPRINT_BUILD_CAPABILITY's own
// doc comment).
function describeUnsupportedTabMessage(tab: ProjectTabDescriptor): string {
    const need = (tab.requiredCapabilities ?? []).map(describeCapability).join(" or ");
    return `"${tab.label}" isn't available for this project -- it requires: ${need}.`;
}

// The page title/breadcrumb label -- a "loaded" project shows its own game identity (id/name/version
// live on the header itself); an "outcome-source" project has no such identity of its own (see
// ProjectHeaderView's own doc comment on why), so this falls back to its resolved ProjectType's own
// label (e.g. "Outcome library", "Stake Engine export") instead of a generic "Project" placeholder.
function describeProjectName(header: ProjectHeaderView): string {
    if (header.status === "loaded") {
        return header.name;
    }
    if (header.status === "outcome-source") {
        return PROJECT_TYPE_LABEL[header.type];
    }
    return "Project";
}

// Mirrors the old app's own showProjectDashboard: every tab's data-loading hook lives here, at the page
// level, and stays mounted regardless of which tab is currently visible -- switching tabs only changes
// what's rendered, never what's running. This matters because the old app kept every section in the DOM
// simultaneously (just hidden via CSS), so a Simulation/Replay run (or an in-flight Deployment request)
// was never interrupted by looking at a different tab; conditionally *mounting* only the active tab's
// hook would silently cancel that background work, which this file exists specifically to avoid.
export function ProjectDashboardPage({requestedProjectRoot}: {requestedProjectRoot?: string} = {}) {
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
            const routePrefix = requestedProjectRoot === undefined ? "/project" : `/project/${encodeURIComponent(requestedProjectRoot)}`;
            navigate(`${routePrefix}/${value}`);
        },
        [navigate, requestedProjectRoot],
    );

    const header = useProjectContext(requestedProjectRoot);
    const projectKey =
        header.status === "loaded" || header.status === "error" || header.status === "outcome-source" ? header.projectRoot : undefined;
    // The only two ProjectHeaderView statuses that carry a `capabilities` array -- used wherever a tab's
    // own content needs "this project's resolved capabilities" without caring whether it's a "loaded"
    // (game-backed) or "outcome-source" (canonical-reader-backed) resolution (see GameModelTab's
    // `editable`/ExportDeployTab's `capabilities` props below).
    const headerCapabilities = header.status === "loaded" || header.status === "outcome-source" ? header.capabilities : [];
    // The real, canonical mode list a resolved "outcomeLibrary"/"stakeAdapter" project's own reader
    // reports (see OutcomeSourceOverview's own "Mode" table, which reads this exact same list) -- the one
    // source of truth Play/Simulation/Replay's own mode pickers below are built from, never a free-text
    // field or an invented default. Undefined for a "loaded" (ordinary game-backed) project, which has no
    // notion of an outcome-library mode at all.
    const outcomeLibraryModes = header.status === "outcome-source" ? header.report.modes.map((mode) => mode.modeName) : undefined;

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
    const [reportDetail, setReportDetail] = useState<ReportDetailState>({status: "empty"});
    const [selectedReportId, setSelectedReportId] = useState<string>();
    const [compareDetail, setCompareDetail] = useState<ReportDetailState>({status: "empty"});
    const [runAgainNotice, setRunAgainNotice] = useState<string>();

    // Monotonic request ids -- same requestId/isStale() pattern BlueprintEditorPage.tsx's own
    // handleValidate already established. Each is bumped both by its own operation's *own* new call
    // (so e.g. two "Open" clicks in a row only ever land the second) and by other events that make an
    // in-flight fetch's result meaningless before it resolves: starting a new run (startRun) and a
    // project switch (the projectKey effect below).
    const reportRequestIdRef = useRef(0);
    const compareRequestIdRef = useRef(0);
    const recentRunsRequestIdRef = useRef(0);

    const refreshReports = useCallback(() => {
        const requestId = ++recentRunsRequestIdRef.current;
        listReports(fetchImpl)
            .then((entries) => {
                if (requestId === recentRunsRequestIdRef.current) {
                    // A successful refresh always clears whatever error a previous attempt left behind --
                    // otherwise a stale "failed to list reports" banner would keep showing next to a list
                    // that just loaded fine.
                    setReportsError(undefined);
                    setReportsView(describeReportsList(entries));
                }
            })
            .catch((error: unknown) => {
                if (requestId === recentRunsRequestIdRef.current) {
                    setReportsError(errorMessage(error));
                }
            });
    }, [fetchImpl]);

    // Used both to auto-open the just-completed live job's report (see the effect below) and to open a
    // historic entry straight from the Recent Runs list -- either way this is "the report Review should
    // show", by id, fetched fresh from the server as a StudioSimulationReportDetail (report + the same
    // statistics a live job's own poll response carries, so a historic report renders identically to a
    // just-completed one) rather than reused from in-memory job state. A stale response (superseded by
    // a newer selectReport/startRun/project-switch) is discarded via reportRequestIdRef. Opening a
    // different main report also invalidates/clears any comparison in progress -- a comparison is only
    // ever meaningful against *this* report (requirement 7).
    const selectReport = useCallback(
        (id: string) => {
            setActiveTab("simulation");
            setSelectedReportId(id);
            setReportDetail({status: "loading"});
            const requestId = ++reportRequestIdRef.current;
            compareRequestIdRef.current++;
            setCompareDetail({status: "empty"});
            getReport(fetchImpl, id)
                .then((detail) => {
                    if (requestId === reportRequestIdRef.current) {
                        setReportDetail({status: "loaded", report: describeSimulationReport(detail.report, detail.statistics)});
                    }
                })
                .catch((error: unknown) => {
                    if (requestId === reportRequestIdRef.current) {
                        setReportDetail({status: "error", message: errorMessage(error)});
                    }
                });
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

    // Every path that starts a new run (Configure submit, Retry, a Recent Runs "Run again") funnels
    // through here so a previous run's report/compare state never lingers stale while the new one is
    // in flight -- also bumps the report/compare request ids so a fetch already in flight *before* this
    // run started can never land afterward and repopulate what was just cleared. Also clears
    // runAgainNotice unconditionally -- whatever blocked the *previous* attempt no longer applies once a
    // run has actually started, regardless of which of the three entry points (Configure, Retry, Run
    // again) got it going.
    const startRun = useCallback(
        (rounds: number, seed: string | undefined, workers: number, modeName?: string) => {
            reportRequestIdRef.current++;
            compareRequestIdRef.current++;
            setReportDetail({status: "empty"});
            setSelectedReportId(undefined);
            setCompareDetail({status: "empty"});
            setRunAgainNotice(undefined);
            simulation.run(rounds, seed, workers, modeName);
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [simulation.run],
    );

    // Also clears once the *previous* blocking simulation reaches a terminal state on its own (completes,
    // fails, or is cancelled) even if the user never clicks "Run again" again -- the notice was only ever
    // about "you can't do this *right now*", so it shouldn't outlive the condition that caused it.
    const prevSimulationStatusRef = useRef<string | undefined>(undefined);
    useEffect(() => {
        const status = simulation.job?.status;
        const wasActive = prevSimulationStatusRef.current === "queued" || prevSimulationStatusRef.current === "running";
        const nowTerminal = status === "completed" || status === "failed" || status === "cancelled";
        if (wasActive && nowTerminal) {
            setRunAgainNotice(undefined);
        }
        prevSimulationStatusRef.current = status;
    }, [simulation.job?.status]);

    const onCompare = useCallback(
        (entry: StudioSimulationReportListEntry) => {
            const requestId = ++compareRequestIdRef.current;
            setCompareDetail({status: "loading"});
            getReport(fetchImpl, entry.id)
                .then((detail) => {
                    if (requestId === compareRequestIdRef.current) {
                        setCompareDetail({status: "loaded", report: describeSimulationReport(detail.report, detail.statistics)});
                    }
                })
                .catch((error: unknown) => {
                    if (requestId === compareRequestIdRef.current) {
                        setCompareDetail({status: "error", message: errorMessage(error)});
                    }
                });
        },
        [fetchImpl],
    );
    const onClearCompare = useCallback(() => {
        compareRequestIdRef.current++;
        setCompareDetail({status: "empty"});
    }, []);

    // Calling simulation.run() while a job is already active doesn't start a second one -- the backend
    // returns a 409 conflict and useSimulationPoll just starts polling the *existing* job (see
    // StudioSimulationService.start()'s own conflict handling) -- so going ahead here would silently
    // reattach to the old job while claiming to run this entry's own rounds/seed/workers. Blocking with
    // a clear message is honest about what the UI can actually do; the Run step's own Cancel button is
    // one click away if the user wants to replace it.
    const onRunAgain = useCallback(
        (entry: StudioSimulationReportListEntry) => {
            if (simulation.job !== undefined && isSimulationActive(simulation.job)) {
                setRunAgainNotice("A simulation is already running for this project. Cancel it from the Run step before starting a different configuration.");
                return;
            }
            // No explicit clear here -- startRun() itself always clears runAgainNotice.
            startRun(entry.requestedRounds, entry.seed, entry.workers, entry.modeName);
        },
        [simulation.job, startRun],
    );

    const [replayListView, setReplayListView] = useState<ReplayListView>({status: "empty"});
    const [replayListError, setReplayListError] = useState<string>();
    // Same monotonic-requestId convention as refreshReports/refreshRecentSpins above -- without it, a
    // refresh still in flight from before a project switch could land afterward and repopulate the
    // list with the *previous* project's replays.
    const replayListRequestIdRef = useRef(0);
    const refreshReplayList = useCallback(() => {
        const requestId = ++replayListRequestIdRef.current;
        listReplays(fetchImpl)
            .then((entries) => {
                if (requestId === replayListRequestIdRef.current) {
                    setReplayListError(undefined);
                    setReplayListView(describeReplayList(entries));
                }
            })
            .catch((error: unknown) => {
                if (requestId === replayListRequestIdRef.current) {
                    setReplayListError(errorMessage(error));
                }
            });
    }, [fetchImpl]);
    const replay = useReplayPoll(refreshReplayList);

    // The "expected" artifact for the Inspect step's match/mismatch banner (requirement 4) -- populated
    // either by fetching a previously-stored replay's own descriptor.artifact (onCompareStored) or by
    // parsing+validating a pasted ReplayDescriptor JSON client-side (onLoadExpectedFromPaste). A stale
    // fetch discarded via expectedReplayRequestIdRef, same convention as reportRequestIdRef above.
    const [expectedReplay, setExpectedReplay] = useState<ExpectedReplayState>({status: "empty"});
    const expectedReplayRequestIdRef = useRef(0);

    const clearExpectedReplay = useCallback(() => {
        expectedReplayRequestIdRef.current++;
        setExpectedReplay({status: "empty"});
    }, []);

    const onCompareStored = useCallback(
        (id: string) => {
            const requestId = ++expectedReplayRequestIdRef.current;
            setExpectedReplay({status: "loading"});
            getReplay(fetchImpl, id)
                .then((job) => {
                    if (requestId !== expectedReplayRequestIdRef.current) {
                        return;
                    }
                    if (!job.descriptor) {
                        setExpectedReplay({status: "error", message: "That replay has no stored result to compare against."});
                        return;
                    }
                    setExpectedReplay({
                        status: "loaded",
                        round: job.descriptor.round,
                        seed: job.descriptor.seed ?? undefined,
                        artifact: job.descriptor.artifact,
                        artifactWarnings: [],
                        stateBefore: job.descriptor.stateBefore,
                        stateAfter: job.descriptor.stateAfter,
                        identity: {
                            label: `replay session ${job.descriptor.sessionId}, replay job ${job.id}`,
                            seed: job.descriptor.seed ?? undefined,
                            timestamp: job.descriptor.timestamp,
                        },
                    });
                })
                .catch((error: unknown) => {
                    if (requestId === expectedReplayRequestIdRef.current) {
                        setExpectedReplay({status: "error", message: describeReplayActionError("The stored replay", errorMessage(error))});
                    }
                });
        },
        [fetchImpl],
    );

    const onLoadExpectedFromPaste = useCallback(
        (raw: string) => {
            const requestId = ++expectedReplayRequestIdRef.current;
            let parsed: unknown;
            try {
                parsed = JSON.parse(raw);
            } catch {
                setExpectedReplay({status: "error", message: "That's not valid JSON."});
                return;
            }
            setExpectedReplay({status: "loading"});
            inspectReplayArtifact(fetchImpl, parsed)
                .then((response) => {
                    if (requestId !== expectedReplayRequestIdRef.current) {
                        return;
                    }
                    const parsedDescriptor =
                        typeof parsed === "object" && parsed !== null
                            ? (parsed as {artifact?: RoundArtifactJson; stateBefore?: unknown; stateAfter?: unknown; sessionId?: string; timestamp?: number})
                            : undefined;
                    setExpectedReplay({
                        status: "loaded",
                        round: response.round,
                        seed: response.seed,
                        artifact: parsedDescriptor?.artifact,
                        artifactWarnings: response.artifactWarnings,
                        stateBefore: parsedDescriptor?.stateBefore,
                        stateAfter: parsedDescriptor?.stateAfter,
                        identity: {
                            label: `pasted replay artifact${parsedDescriptor?.sessionId ? `, session ${parsedDescriptor.sessionId}` : ""}, round ${response.round}`,
                            seed: response.seed,
                            timestamp: parsedDescriptor?.timestamp,
                        },
                    });
                })
                .catch((error: unknown) => {
                    if (requestId === expectedReplayRequestIdRef.current) {
                        setExpectedReplay({status: "error", message: describeReplayActionError("The pasted artifact", errorMessage(error))});
                    }
                });
        },
        [fetchImpl],
    );

    // Runs a replay, clearing any in-progress "expected artifact" comparison unless the caller is the
    // one continuing that exact comparison (the artifact Load step's own "Continue to Reproduce") --
    // otherwise a stale `expectedReplay` from an earlier artifact-compare attempt would produce a bogus
    // match/mismatch banner on a later, unrelated Recreate from seed / Recent Simulation reproduction.
    const runReplay = useCallback(
        (round: number, seed: string | undefined, simulationId?: string, keepExpected?: boolean, modeName?: string) => {
            if (!keepExpected) {
                clearExpectedReplay();
            }
            replay.run(round, seed, simulationId, modeName);
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [replay.run, clearExpectedReplay],
    );

    // Returns the fetch's own promise (rather than swallowing a failure) so ReplayTab's "Inspect" click
    // handler only advances to the Inspect step on success -- previously a failed fetch here (network
    // blip, a since-deleted job) still jumped the user to step 3 with the *previous* replay.job left
    // showing (or nothing at all), no error, no indication anything went wrong. Also surfaces the
    // failure through replayListError -- the same state the "Recent replays" section right below this
    // list already displays -- since there's no other error slot naturally reachable from this click.
    const onInspectStored = useCallback(
        (id: string): Promise<void> => {
            clearExpectedReplay();
            return getReplay(fetchImpl, id)
                .then((job) => {
                    replay.selectExisting(job);
                    setReplayListError(undefined);
                })
                .catch((error: unknown) => {
                    setReplayListError(errorMessage(error));
                    throw error;
                });
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [fetchImpl, clearExpectedReplay, replay.selectExisting],
    );

    // Computed whenever the user has actually requested a comparison (expectedReplay left "empty") and
    // the reproduction has completed -- always via describeReplayComparison, which safely resolves to
    // its own "unavailable" status (with diagnostics) rather than the page silently omitting the banner
    // when the expected artifact turns out malformed (requirement 1).
    const replayComparison =
        expectedReplay.status === "loaded" && replay.job?.status === "completed"
            ? describeReplayComparison(
                {
                    artifact: expectedReplay.artifact,
                    artifactWarnings: expectedReplay.artifactWarnings,
                    stateBefore: expectedReplay.stateBefore,
                    stateAfter: expectedReplay.stateAfter,
                    identity: expectedReplay.identity,
                },
                {
                    artifact: replay.job.descriptor?.artifact,
                    stateBefore: replay.job.descriptor?.stateBefore,
                    stateAfter: replay.job.descriptor?.stateAfter,
                    identity: replay.job.descriptor
                        ? {
                            label: `replay session ${replay.job.descriptor.sessionId}, replay job ${replay.job.id}`,
                            seed: replay.job.descriptor.seed ?? undefined,
                            timestamp: replay.job.descriptor.timestamp,
                        }
                        : undefined,
                },
            )
            : undefined;

    const [recentSpinsView, setRecentSpinsView] = useState<RecentSpinsListView>({status: "loading"});
    const [recentSpinsError, setRecentSpinsError] = useState<string>();
    const recentSpinsRequestIdRef = useRef(0);
    const refreshRecentSpins = useCallback(() => {
        const requestId = ++recentSpinsRequestIdRef.current;
        setRecentSpinsView({status: "loading"});
        listRecentSpins(fetchImpl)
            .then((entries) => {
                if (requestId !== recentSpinsRequestIdRef.current) {
                    return;
                }
                setRecentSpinsError(undefined);
                setRecentSpinsView(describeRecentSpinsList(entries));
            })
            .catch((error: unknown) => {
                if (requestId === recentSpinsRequestIdRef.current) {
                    setRecentSpinsError(errorMessage(error));
                }
            });
    }, [fetchImpl]);

    const play = usePlaySession(refreshRecentSpins);
    const deployment = useDeploymentManager();

    // Set by GameModelTab whenever its own in-progress section edit has unsaved changes (see its own
    // `onDirtyChange` doc comment) -- folded into `hasActiveOperation`'s own "confirm before Close
    // project" gate below, the same way an active simulation/replay/deployment already is, rather than
    // letting a Close silently discard an unsaved Game Model edit.
    const [gameModelDirty, setGameModelDirty] = useState(false);

    useEffect(() => {
        if (projectKey === undefined) {
            return;
        }
        // A genuinely different project must never show a trace of the previous one -- bump every
        // request id so a fetch still in flight from before the switch can't land afterward and
        // repopulate what's being cleared here, then clear all of this project-scoped state before the
        // fresh fetches below start.
        reportRequestIdRef.current++;
        compareRequestIdRef.current++;
        recentRunsRequestIdRef.current++;
        setReportDetail({status: "empty"});
        setSelectedReportId(undefined);
        setCompareDetail({status: "empty"});
        setReportsView({status: "empty"});
        setReportsError(undefined);
        setRunAgainNotice(undefined);
        expectedReplayRequestIdRef.current++;
        setExpectedReplay({status: "empty"});
        recentSpinsRequestIdRef.current++;
        setRecentSpinsView({status: "empty"});
        setRecentSpinsError(undefined);
        replayListRequestIdRef.current++;
        setReplayListView({status: "empty"});
        setReplayListError(undefined);
        // simulation/replay own no page-level view state to reset here (their job/progress/error live
        // inside useSimulationPoll/useReplayPoll themselves) -- resetForProjectSwitch() is what a
        // genuinely different project needs to stop showing the previous one's simulation/replay job.
        simulation.resetForProjectSwitch();
        replay.resetForProjectSwitch();
        // Overview's own validation diagnostics run automatically as soon as a project is open --
        // there's no more separate "Validate" section a user has to remember to click into (see
        // OverviewTab's own ValidationDiagnostics). runValidate() itself sets `validation` to "loading"
        // synchronously, so a genuine project switch never shows the *previous* project's stale result.
        runValidate();
        refreshReports();
        refreshReplayList();
        refreshRecentSpins();
        play.resetForProjectSwitch();
        deployment.resetForProjectSwitch();
        deployment.refreshTargets();
        deployment.refreshProjectModesAndRegistry();
        // Deliberately keyed only on projectKey -- these refreshers should run once per newly-loaded
        // project, not every time one of their own (stable, useCallback-memoized) references changes.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [projectKey]);

    const hasActiveOperation =
        (simulation.job !== undefined && isSimulationActive(simulation.job)) ||
        (replay.job !== undefined && isReplayActive(replay.job)) ||
        deployment.runLoading;

    const activeTabDescriptor = ALL_PROJECT_TABS.find((tab) => tab.value === activeTab);
    const activeTabLabel = activeTabDescriptor?.label ?? "Overview";
    // Whether the active tab's own workflow component should actually mount -- a deep link to an
    // unsupported operation (e.g. /project/simulation for a project that can't run in-process) shows
    // describeUnsupportedTabMessage's diagnostic instead, below, rather than ever invoking that tab's
    // own hooks/fetches.
    const activeTabSupported = activeTabDescriptor === undefined || isTabSupported(activeTabDescriptor, header);
    const projectName = describeProjectName(header);
    useDocumentTitle(`${projectName} · ${activeTabLabel} · POKIE Studio`);

    // Moves focus into the active tab's content whenever the section changes, keeping keyboard/screen-
    // reader users oriented after a navigation -- keyed on header.status too so it also fires once more
    // when the page finishes loading fresh from Home (the wrapper this ref points at doesn't exist yet
    // while still "loading", so the very first activeTab-only effect run can't reach it).
    const panelRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        panelRef.current?.focus();
    }, [activeTab, header.status]);

    const [closeError, setCloseError] = useState<string>();
    const closeGuard = useDoubleSubmitGuard();
    const handleClose = (): void => {
        const doClose = (): void => {
            if (!closeGuard.begin()) {
                return;
            }
            setCloseError(undefined);
            closeProject(fetchImpl)
                .then(() => {
                    navigate("/home/design");
                })
                .catch((error: unknown) => setCloseError(errorMessage(error)))
                .finally(() => closeGuard.end());
        };
        if (!hasActiveOperation && !gameModelDirty) {
            doClose();
            return;
        }
        const reasons = [
            hasActiveOperation ? "an active simulation, replay, or deployment" : undefined,
            gameModelDirty ? "unsaved Game Model changes" : undefined,
        ].filter((reason): reason is string => reason !== undefined);
        confirm(`This project has ${reasons.join(" and ")}. Close the project anyway?`, doClose);
    };

    if (header.status === "empty") {
        return (
            <AppShellLayout navbar={<NavTabs items={visibleProjectTabs(header)} active={activeTab} onSelect={setActiveTab} />}>
                <Text>
                    No active project. <Anchor href="#/home/design">Go to Home</Anchor>.
                </Text>
            </AppShellLayout>
        );
    }

    return (
        <AppShellLayout
            navbar={<NavTabs items={visibleProjectTabs(header)} active={activeTab} onSelect={setActiveTab} />}
            breadcrumbs={[
                {label: projectName, onClick: () => setActiveTab("overview")},
                {label: activeTabLabel},
            ]}
            // Same warn-then-close-then-navigate path as the "Close project" button below (see
            // handleClose) -- without this, the brand link's default `href="#/"` would silently bounce
            // back to this same still-active project (see AppShellLayout's own onHomeClick doc comment),
            // discarding an unapplied Mechanics Editor draft or an active operation with no warning at all.
            onHomeClick={handleClose}
        >
            <div>
                <Title order={2}>{describeProjectName(header)}</Title>
                <Text c="dimmed">{header.projectRoot}</Text>
                <Button variant="default" size="xs" mt="xs" onClick={handleClose} loading={closeGuard.isBlocked()}>
                    Close project
                </Button>
                {closeError && (
                    <div style={{marginTop: "0.5rem"}}>
                        <ErrorState message={`Couldn't close the project: ${closeError}`} />
                    </div>
                )}
            </div>

            {header.status === "loading" && (
                <div style={{marginTop: "1rem"}}>
                    <LoadingState label="Loading project…" />
                </div>
            )}
            {header.status === "error" && (
                <div style={{marginTop: "1rem"}}>
                    <ErrorState message={header.message} detail={header.errorDetail} />
                </div>
            )}
            {(header.status === "loaded" || header.status === "error" || header.status === "outcome-source") && (
                <div ref={panelRef} tabIndex={-1} style={{marginTop: "1rem"}}>
                    {!activeTabSupported && activeTabDescriptor !== undefined && <ErrorState message={describeUnsupportedTabMessage(activeTabDescriptor)} />}
                    {activeTabSupported && (
                        <>
                            {activeTab === "overview" && header.status === "loaded" && (
                                <OverviewTab header={header} validation={validation} onRevalidate={runValidate} />
                            )}
                            {activeTab === "overview" && header.status === "outcome-source" && (
                                <OutcomeSourceOverview header={header} onRoundRecorded={refreshRecentSpins} />
                            )}
                            {activeTab === "gameModel" && (
                            // GameModelTab owns all of its own fetch state locally (no page-level hook),
                            // so a genuine project switch needs a full remount, not just a re-render of a
                            // still-mounted instance holding the previous project's own projection.
                            // `editable` is exactly BLUEPRINT_BUILD_CAPABILITY -- a saved Blueprint
                            // Project Studio can load/save in place (see buildProjectGameModel's own doc
                            // comment); a materialized tsPackage never carries that capability, so it
                            // never offers Edit here.
                                <GameModelTab
                                    key={projectKey ?? "no-project"}
                                    editable={headerCapabilities.includes(BLUEPRINT_BUILD_CAPABILITY)}
                                    projectRoot={projectKey}
                                    onDirtyChange={setGameModelDirty}
                                />
                            )}
                            {activeTab === "play" && (
                                <PlayTab
                                    key={projectKey ?? "no-project"}
                                    session={play.session}
                                    sessionId={play.sessionId}
                                    onNewSession={play.newSession}
                                    onSpin={play.spin}
                                    onFindAnyWin={play.findAnyWin}
                                    onFindSymbolWin={play.findSymbolWin}
                                    onFindFreeGames={play.findFreeGames}
                                    availableModes={outcomeLibraryModes}
                                />
                            )}
                            {activeTab === "simulation" && (
                                <SimulationTab
                                    key={projectKey ?? "no-project"}
                                    progress={simulation.progress}
                                    error={simulation.error}
                                    onRun={startRun}
                                    onCancel={() => {
                                    // Clears eagerly (not just via the terminal-state effect) so the notice
                                    // doesn't linger for the ~poll-interval it takes the job to actually
                                    // reflect "cancelled".
                                        setRunAgainNotice(undefined);
                                        simulation.cancel();
                                    }}
                                    onRetry={() =>
                                        simulation.job && startRun(simulation.job.rounds, simulation.job.seed, simulation.job.workers, simulation.job.modeName)
                                    }
                                    recentRuns={reportsView}
                                    recentRunsError={reportsError}
                                    onRefreshRecentRuns={refreshReports}
                                    reviewedDetail={reportDetail}
                                    currentReportId={selectedReportId}
                                    onOpenHistoric={(entry: StudioSimulationReportListEntry) => selectReport(entry.id)}
                                    onRunAgain={onRunAgain}
                                    runAgainNotice={runAgainNotice}
                                    compareDetail={compareDetail}
                                    onCompare={onCompare}
                                    onClearCompare={onClearCompare}
                                    downloadUrls={
                                        reportDetail.status === "loaded" && selectedReportId
                                            ? {
                                                json: buildReportDownloadUrl(selectedReportId, "json"),
                                                markdown: buildReportDownloadUrl(selectedReportId, "markdown"),
                                                html: buildReportDownloadUrl(selectedReportId, "html"),
                                            }
                                            : undefined
                                    }
                                    availableModes={outcomeLibraryModes}
                                />
                            )}
                            {activeTab === "replay" && (
                                <ReplayTab
                                    key={projectKey ?? "no-project"}
                                    progress={replay.progress}
                                    result={replay.job?.status === "completed" ? describeReplayResult(replay.job) : undefined}
                                    error={replay.error}
                                    onRun={runReplay}
                                    onCancel={replay.cancel}
                                    onRetry={() =>
                                        replay.job &&
                                        runReplay(
                                            replay.job.round,
                                            replay.job.seed,
                                            replay.job.simulationId,
                                            expectedReplay.status === "loaded",
                                            replay.job.modeName,
                                        )
                                    }
                                    listView={replayListView}
                                    listError={replayListError}
                                    onRefreshList={refreshReplayList}
                                    onInspectStored={onInspectStored}
                                    onCompareStored={onCompareStored}
                                    expected={expectedReplay}
                                    onLoadExpectedFromPaste={onLoadExpectedFromPaste}
                                    onClearExpected={clearExpectedReplay}
                                    comparison={replayComparison}
                                    recentSpins={recentSpinsView}
                                    recentSpinsError={recentSpinsError}
                                    onRefreshRecentSpins={refreshRecentSpins}
                                    recentRuns={reportsView}
                                    recentRunsError={reportsError}
                                    onRefreshRecentRuns={refreshReports}
                                    currentGame={header.status === "loaded" ? {id: header.id, version: header.version} : undefined}
                                    availableModes={outcomeLibraryModes}
                                />
                            )}
                            {activeTab === "exportDeploy" && (
                                <ExportDeployTab key={projectKey ?? "no-project"} capabilities={headerCapabilities} deployment={deployment} />
                            )}
                            {activeTab === "certification" && (
                            // Same reasoning as GameModelTab's own key above -- CertificationTab owns
                            // all of its own stepper state locally (no page-level hook).
                                <CertificationTab key={projectKey ?? "no-project"} projectRoot={projectKey} />
                            )}
                            {activeTab === "provablyFair" && (
                            // Same reasoning as GameModelTab's own key above -- ProvablyFairTab owns
                            // all of its own stepper state locally (no page-level hook).
                                <ProvablyFairTab key={projectKey ?? "no-project"} projectRoot={projectKey} />
                            )}
                        </>
                    )}
                </div>
            )}
        </AppShellLayout>
    );
}
