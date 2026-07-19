import {Anchor, Button, Text, Title} from "@mantine/core";
import {useDocumentTitle} from "@mantine/hooks";
import {useCallback, useEffect, useRef, useState} from "react";
import {useNavigate, useParams} from "react-router-dom";
import {
    buildReportDownloadUrl,
    closeProject,
    getReplay,
    getReport,
    inspectProject,
    inspectReplayArtifact,
    listRecentSpins,
    listReplays,
    listReports,
    validateProject,
} from "../../api/apiClient";
import type {RoundArtifactJson, StudioSimulationReportListEntry} from "../../api/types";
import {useStudioApi} from "../../context/StudioApiProvider";
import {errorMessage} from "../../domain/errorMessage";
import {
    describeInspection,
    describeNextAction,
    describeValidationSummary,
    type InspectionResultView,
    type ProjectValidationView,
} from "../../domain/interpret/ProjectDashboard";
import {describeReplayComparison, describeReplayList, describeReplayResult, isReplayActive, type ReplayListView} from "../../domain/interpret/Replay";
import {describeReportsList, type ReportListView} from "../../domain/interpret/Reports";
import {describeRecentSpinsList, type RecentSpinsListView} from "../../domain/interpret/Runtime";
import {describeSimulationReport, isSimulationActive} from "../../domain/interpret/Simulation";
import {useConfirm} from "../../hooks/useConfirm";
import {useDeploymentManager} from "../../hooks/useDeploymentManager";
import {useDoubleSubmitGuard} from "../../hooks/useDoubleSubmitGuard";
import {useNavigationBlockerConfirm} from "../../hooks/useNavigationBlockerConfirm";
import {useProjectContext} from "../../hooks/useProjectContext";
import {useReplayPoll} from "../../hooks/useReplayPoll";
import {useRuntimeManager} from "../../hooks/useRuntimeManager";
import {useSimulationPoll} from "../../hooks/useSimulationPoll";
import {ErrorState} from "../common/ErrorState";
import {LoadingState} from "../common/LoadingState";
import {AppShellLayout} from "../layout/AppShellLayout";
import {NavTabs, type NavTabItem} from "../layout/NavTabs";
import {DeploymentTab} from "./DeploymentTab";
import {MechanicsEditorTab} from "./MechanicsEditorTab";
import {OutcomeLibrariesTab} from "./OutcomeLibrariesTab";
import {OverviewTab} from "./OverviewTab";
import {ReplayTab, type ExpectedReplayState} from "./ReplayTab";
import {RuntimeTab} from "./RuntimeTab";
import {SimulationTab, type ReportDetailState} from "./SimulationTab";
import {ValidationTab} from "./ValidationTab";

export type ProjectTab = "overview" | "validation" | "simulation" | "replay" | "runtime" | "deployment" | "outcomeLibraries" | "mechanicsEditor";

// Primary happy-path tabs (Overview -> Validate -> Simulate, which now also owns Reports) come first,
// unlabeled/implicit; Replay/Runtime/Deployment/Outcome Libraries/Mechanics Editor are tagged
// `section: "Advanced"` so NavTabs visually separates them -- everything's still one click away, just
// no longer presented as equal-weight to the main flow.
const PROJECT_TABS: NavTabItem<ProjectTab>[] = [
    {value: "overview", label: "Overview"},
    {value: "validation", label: "Validate"},
    {value: "simulation", label: "Simulation & Reports"},
    {value: "replay", label: "Replay", section: "Advanced"},
    {value: "runtime", label: "Runtime", section: "Advanced"},
    {value: "deployment", label: "Deployment", section: "Advanced"},
    {value: "outcomeLibraries", label: "Outcome Libraries", section: "Advanced"},
    {value: "mechanicsEditor", label: "Mechanics Editor", section: "Advanced"},
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

    // MechanicsEditorTab owns its own draft entirely locally (no page-level hook, unlike every other
    // tab's state) and reports its own dirty-ness up through this -- mirroring BlueprintEditorPage's own
    // onDirtyChange prop exactly (see its doc comment).
    const [isMechanicsEditorDirty, setIsMechanicsEditorDirty] = useState(false);
    // Consumed by the blocker predicate to let exactly one subsequent navigate() through unblocked --
    // same convention/reasoning as useDesignNavigationGuard's own suppressNextBlockRef (see its doc
    // comment): react-router's useBlocker only re-registers its predicate via a useEffect, which runs
    // *after* the commit that cleared isMechanicsEditorDirty -- a promise-chain navigate() (like Close
    // project's own closeProject().then(() => navigate(...)) below) resolves via microtasks, which can
    // race ahead of that effect and still see the *old* (dirty) predicate. Clearing isMechanicsEditorDirty
    // alone is therefore not enough for a confirmed action with its own async work before its own
    // navigate() call; this flag is what actually guarantees that navigate() isn't blocked a second time.
    // Close project only sets this (and clears isMechanicsEditorDirty) inside closeProject()'s own
    // .then(), never before the request starts -- until the request actually succeeds, the draft is
    // still there and every other way of leaving Mechanics Editor must stay guarded, including a second
    // Close attempt while the first is still pending or after it failed.
    const suppressMechanicsEditorBlockRef = useRef(false);
    // MechanicsEditorTab doesn't unmount in the same commit as a blocker-confirmed Leave (a NavTabs
    // click or Back/Forward that the blocker below had to ask about) -- react-router keeps the outgoing
    // route's tree mounted for one or more extra renders while the transition is in flight, and
    // MechanicsEditorTab's own dirty-tracking effect (no dependency array, runs after every render --
    // see its own doc comment) keeps re-reporting `true` during those renders, since the draft itself
    // hasn't actually been discarded, only abandoned. Left unguarded, one of those stale echoes lands
    // *after* onLeave's setIsMechanicsEditorDirty(false) and silently re-dirties this page's state
    // forever (confirmed via instrumentation: the last dirty:true report before the real unmount always
    // wins), which a *later* Close project would then wrongly warn about. This ref is what actually
    // prevents that -- set the instant a Leave is confirmed, it makes handleMechanicsEditorDirtyChange
    // below ignore every further report from *this* (doomed) instance; the effect right after it resets
    // the ref the moment activeTab actually leaves "mechanicsEditor", which is the same commit
    // MechanicsEditorTab itself unmounts in, so a genuinely fresh mount's reports are never mistakenly
    // ignored. Close project doesn't need this: it lets its own navigate() through via
    // suppressMechanicsEditorBlockRef regardless of isMechanicsEditorDirty's value, and the whole page
    // (including this ref) unmounts with it either way.
    const ignoreMechanicsEditorDirtyReportsRef = useRef(false);
    useEffect(() => {
        if (activeTab !== "mechanicsEditor") {
            return undefined;
        }
        return () => {
            ignoreMechanicsEditorDirtyReportsRef.current = false;
        };
    }, [activeTab]);
    const handleMechanicsEditorDirtyChange = useCallback((dirty: boolean) => {
        if (ignoreMechanicsEditorDirtyReportsRef.current) {
            return;
        }
        setIsMechanicsEditorDirty(dirty);
    }, []);
    // Guards a dirty Mechanics Editor draft against *every* way of leaving it -- a NavTabs click, browser
    // Back/Forward, and any other in-app navigate() call are all just "history transitions" to a data
    // router, blocked uniformly by useNavigationBlockerConfirm's predicate below (the same mechanism
    // useDesignNavigationGuard uses for a dirty Home Design & Build draft -- see its own doc comment).
    // Deliberately not the *full* guard system Home has (no guardedAction as its own exported action, no
    // hashchange fallback, no beforeunload) -- Close project is this tab's only "action with a side
    // effect before its own navigate() call", handled inline via suppressMechanicsEditorBlockRef instead
    // of a second copy of guardedAction. onLeave clears isMechanicsEditorDirty and locks out further
    // stale reports (see ignoreMechanicsEditorDirtyReportsRef above) the instant the user actually
    // confirms leaving -- never on Cancel -- so a *later* Close project doesn't show a ghost "unapplied
    // draft" warning for a draft the user already agreed to lose.
    useNavigationBlockerConfirm(
        ({currentLocation, nextLocation}) => {
            const leavingMechanicsEditor = currentLocation.pathname === "/project/mechanicsEditor" && nextLocation.pathname !== currentLocation.pathname;
            if (!isMechanicsEditorDirty || !leavingMechanicsEditor) {
                return false;
            }
            if (suppressMechanicsEditorBlockRef.current) {
                suppressMechanicsEditorBlockRef.current = false;
                return false;
            }
            return true;
        },
        {
            title: "Unapplied changes",
            children: "You have an unapplied draft in Mechanics Editor. Leave and lose it?",
            labels: {confirm: "Leave", cancel: "Stay"},
        },
        () => {
            ignoreMechanicsEditorDirtyReportsRef.current = true;
            setIsMechanicsEditorDirty(false);
        },
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
        (rounds: number, seed: string | undefined, workers: number) => {
            reportRequestIdRef.current++;
            compareRequestIdRef.current++;
            setReportDetail({status: "empty"});
            setSelectedReportId(undefined);
            setCompareDetail({status: "empty"});
            setRunAgainNotice(undefined);
            simulation.run(rounds, seed, workers);
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
            startRun(entry.requestedRounds, entry.seed, entry.workers);
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
                    });
                })
                .catch((error: unknown) => {
                    if (requestId === expectedReplayRequestIdRef.current) {
                        setExpectedReplay({status: "error", message: errorMessage(error)});
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
                            ? (parsed as {artifact?: RoundArtifactJson; stateBefore?: unknown; stateAfter?: unknown})
                            : undefined;
                    setExpectedReplay({
                        status: "loaded",
                        round: response.round,
                        seed: response.seed,
                        artifact: parsedDescriptor?.artifact,
                        artifactWarnings: response.artifactWarnings,
                        stateBefore: parsedDescriptor?.stateBefore,
                        stateAfter: parsedDescriptor?.stateAfter,
                    });
                })
                .catch((error: unknown) => {
                    if (requestId === expectedReplayRequestIdRef.current) {
                        setExpectedReplay({status: "error", message: errorMessage(error)});
                    }
                });
        },
        [fetchImpl],
    );

    // Runs a replay, clearing any in-progress "expected artifact" comparison unless the caller is the
    // one continuing that exact comparison (the artifact Load step's own "Continue to Reproduce") --
    // otherwise a stale `expectedReplay` from an earlier artifact-compare attempt would produce a bogus
    // match/mismatch banner on a later, unrelated Seed & Round / Recent Simulation reproduction.
    const runReplay = useCallback(
        (round: number, seed: string | undefined, keepExpected = false) => {
            if (!keepExpected) {
                clearExpectedReplay();
            }
            replay.run(round, seed);
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
                },
                {
                    artifact: replay.job.descriptor?.artifact,
                    stateBefore: replay.job.descriptor?.stateBefore,
                    stateAfter: replay.job.descriptor?.stateAfter,
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

    const runtime = useRuntimeManager();
    const deployment = useDeploymentManager();

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
        refreshInspect();
        refreshReports();
        refreshReplayList();
        refreshRecentSpins();
        runtime.resetForProjectSwitch();
        runtime.refresh();
        deployment.resetForProjectSwitch();
        deployment.refreshTargets();
        // Deliberately keyed only on projectKey -- these refreshers should run once per newly-loaded
        // project, not every time one of their own (stable, useCallback-memoized) references changes.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [projectKey]);

    const hasActiveOperation =
        (simulation.job !== undefined && isSimulationActive(simulation.job)) ||
        (replay.job !== undefined && isReplayActive(replay.job)) ||
        runtime.running ||
        deployment.runLoading;

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

    const [closeError, setCloseError] = useState<string>();
    const closeGuard = useDoubleSubmitGuard();
    const handleClose = (): void => {
        const doClose = (): void => {
            if (!closeGuard.begin()) {
                return;
            }
            // Deliberately does NOT clear isMechanicsEditorDirty (or arm the suppress ref) here, before
            // the request even starts -- the draft isn't actually gone until closeProject() genuinely
            // succeeds. While the request is pending, or if it fails, the draft is exactly as unapplied
            // as it was before this click, so the navigation-blocker guard above must keep protecting it
            // against any other way of leaving Mechanics Editor -- clearing eagerly would open a window
            // where a pending/failed close silently leaves the draft undefended.
            setCloseError(undefined);
            closeProject(fetchImpl)
                .then(() => {
                    // Only now is the draft actually gone -- this is the one call site with an async side
                    // effect (closeProject) before its own eventual navigate() -- exactly
                    // useDesignNavigationGuard's guardedAction shape (see its doc comment). Setting
                    // isMechanicsEditorDirty alone would not be enough for that navigate() call below:
                    // useBlocker re-registers its predicate via a useEffect, which runs after commit,
                    // while navigate() here runs synchronously in this same microtask and could still see
                    // the router's stale (dirty) predicate. The suppress ref is what actually lets this
                    // specific navigate() through unblocked regardless.
                    setIsMechanicsEditorDirty(false);
                    suppressMechanicsEditorBlockRef.current = true;
                    navigate("/home/design");
                })
                // A failed close must be visible, not indistinguishable from the button silently doing
                // nothing -- the guard is released here too, so the user can actually retry. Dirty state
                // and the suppress ref were never touched above, so the draft and its guard are exactly
                // as they were before this attempt.
                .catch((error: unknown) => setCloseError(errorMessage(error)))
                .finally(() => closeGuard.end());
        };
        // Both risks named together when both apply -- a project can simultaneously have an unapplied
        // Mechanics Editor draft *and* an active simulation/replay/deployment/runtime; picking only one
        // to mention would silently hide the other.
        const risks: string[] = [];
        if (isMechanicsEditorDirty) {
            risks.push("an unapplied Mechanics Editor draft");
        }
        if (hasActiveOperation) {
            risks.push("an active simulation, replay, deployment, or running runtime");
        }
        if (risks.length === 0) {
            doClose();
            return;
        }
        const risksText = risks.length === 2 ? `${risks[0]} and ${risks[1]}` : risks[0];
        const lossWarning = isMechanicsEditorDirty ? " Any unapplied draft will be lost." : "";
        confirm(`This project has ${risksText}. Close the project anyway?${lossWarning}`, doClose);
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
                    <ErrorState message={header.message} />
                </div>
            )}

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
                            onCancel={() => {
                                // Clears eagerly (not just via the terminal-state effect) so the notice
                                // doesn't linger for the ~poll-interval it takes the job to actually
                                // reflect "cancelled".
                                setRunAgainNotice(undefined);
                                simulation.cancel();
                            }}
                            onRetry={() => simulation.job && startRun(simulation.job.rounds, simulation.job.seed, simulation.job.workers)}
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
                        />
                    )}
                    {activeTab === "replay" && (
                        <ReplayTab
                            progress={replay.progress}
                            result={replay.job?.status === "completed" ? describeReplayResult(replay.job) : undefined}
                            error={replay.error}
                            onRun={runReplay}
                            onCancel={replay.cancel}
                            onRetry={() => replay.job && runReplay(replay.job.round, replay.job.seed, expectedReplay.status === "loaded")}
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
                        />
                    )}
                    {activeTab === "runtime" && (
                        <RuntimeTab
                            // Forces a full remount on a genuine project switch -- RuntimeTab stays
                            // mounted across ProjectDashboardPage's own project-switch effect otherwise
                            // (the page is deliberately designed not to remount itself, see its own doc
                            // comment), which would leave activeStep/pendingAdvanceStepRef/manual spin
                            // overrides from the previous project's session dangling. A key change is
                            // React's own "reset every bit of local state" primitive -- simpler and more
                            // complete than enumerating each piece of local state by hand.
                            key={projectKey ?? "no-project"}
                            state={runtime.state}
                            running={runtime.running}
                            session={runtime.session}
                            sessionId={runtime.sessionId}
                            lastSpin={runtime.lastSpin}
                            onRefresh={runtime.refresh}
                            onStart={runtime.start}
                            onStop={runtime.stop}
                            onRestart={runtime.restart}
                            onCreateSession={runtime.createSession}
                            onLoadSession={runtime.loadSession}
                            onSpin={runtime.spin}
                            onRepeatSpin={runtime.repeatSpin}
                            history={runtime.history}
                            recentSpins={recentSpinsView}
                            recentSpinsError={recentSpinsError}
                            onRefreshRecentSpins={refreshRecentSpins}
                        />
                    )}
                    {activeTab === "deployment" && (
                        <DeploymentTab
                            // Forces a full remount on a genuine project switch -- same reasoning as
                            // RuntimeTab's own key above: DeploymentTab owns local stepper state
                            // (activeStep/pendingAdvanceStepRef) that deployment.resetForProjectSwitch()
                            // itself can't reach (it only resets the page-level hook's own state), and
                            // ProjectDashboardPage deliberately never remounts itself on a project switch.
                            key={projectKey ?? "no-project"}
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
                    {activeTab === "outcomeLibraries" && (
                        // Forces a full remount on a genuine project switch -- OutcomeLibrariesTab owns all
                        // of its own state locally (no page-level hook), same reasoning as DeploymentTab's
                        // own key above.
                        <OutcomeLibrariesTab
                            key={projectKey ?? "no-project"}
                            onUseInRuntime={(selector, expectedHash) => {
                                // restart() (not start()) so this always takes effect, whether the
                                // runtime is currently stopped or already running some other
                                // configuration -- see StudioRuntimeManager.restart()'s own doc comment.
                                // expectedHash is the hash Outcome Libraries already showed for this
                                // library -- passing it lets the server refuse to silently start against
                                // content that changed on disk since (see StudioRuntimeManager.
                                // startInternal()'s own doc comment).
                                runtime.restart({preGeneratedLibrarySelector: selector, preGeneratedLibraryExpectedHash: expectedHash});
                                setActiveTab("runtime");
                            }}
                        />
                    )}
                    {activeTab === "mechanicsEditor" && (
                        // Same reasoning as OutcomeLibrariesTab's own key above -- MechanicsEditorTab owns
                        // all of its own draft state locally (via useBlueprintEditor), so a genuine project
                        // switch is handled by a full remount rather than page-level cleanup.
                        <MechanicsEditorTab key={projectKey ?? "no-project"} onDirtyChange={handleMechanicsEditorDirtyChange} />
                    )}
                </div>
            )}
        </AppShellLayout>
    );
}
