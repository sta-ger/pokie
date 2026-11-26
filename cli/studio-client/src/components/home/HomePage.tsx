import {Alert, Button, Stack, Text, Title} from "@mantine/core";
import {useDocumentTitle} from "@mantine/hooks";
import {useEffect, useRef, useState, type ReactNode} from "react";
import {useLocation, useNavigate, useParams} from "react-router-dom";
import {BlueprintEditorPage} from "../blueprintEditor/BlueprintEditorPage";
import {DesignNavigationGuardProvider} from "../../context/DesignNavigationGuardContext";
import {useDesignNavigationGuard} from "../../hooks/useDesignNavigationGuard";
import {AppShellLayout} from "../layout/AppShellLayout";
import {NavTabs, type NavTabItem} from "../layout/NavTabs";
import {DocumentationLinks} from "./DocumentationLinks";
import {ProjectsPanel} from "./ProjectsPanel";
import type {StudioJobView, StudioOpenFolderView, StudioProjectRegistryView} from "../../api/types";
import {checkNativePickerAvailability, dismissHomeSourceJob, openOutputFolder, ProjectOpenInProgressError, revealOutputPath} from "../../api/apiClient";
import {useStudioApi} from "../../context/StudioApiProvider";
import {useHomeSourceJobs} from "../../hooks/useHomeSourceJobs";
import {JobCard} from "../common/JobCard";
import {JobObservationNotice} from "../common/JobObservationNotice";
import {useOpenProject} from "../../hooks/useOpenProject";
import {errorMessage} from "../../domain/errorMessage";
import {HomeProjectJobs} from "./HomeProjectJobs";
import {useDoubleSubmitGuard} from "../../hooks/useDoubleSubmitGuard";
import {groupHomeJobs} from "../../domain/interpret/HomeJobs";

export type HomeTab = "design" | "projects";

const HOME_TABS: NavTabItem<HomeTab>[] = [
    {value: "design", label: "Start a game", auditControlId: "home-tab:design", panelId: "home-design-panel"},
    {value: "projects", label: "Projects", auditControlId: "home-tab:projects", panelId: "home-projects-panel"},
];

function isHomeTab(value: string | undefined): value is HomeTab {
    return HOME_TABS.some((tab) => tab.value === value);
}

function describeJobOutputAction(result: StudioOpenFolderView, success: string): string {
    if (result.status === "ok") return success;
    if (result.status === "unavailable") return result.reason;
    return result.message;
}

// Task-oriented Home: 2 areas. "Design Game" is the primary happy path -- Blank/Random/Existing (the
// guided BlueprintEditorPage's own "New Blueprint" dialog, see NewBlueprintDialog) -> configure the game
// model -> validate -> build -> land in the Project Dashboard -- and is the default tab. "Projects" is
// every already-known project (managed or registered, see ProjectsPanel/StudioProjectRegistrationService)
// plus "Import Project", which detects/previews/validates a target before ever registering it, and routes
// a detected PAR sheet into Design Game's own PAR Sheet Import/Export panel instead (see ProjectsPanel's
// own `handleGoToDesignGame` doc comment) since there's no "open" story for a PAR sheet the way there is
// for a runnable package.
//
// "Advanced Tools" (hand-coded scaffold, init-in-place, build-from-an-existing-blueprint-file) has been
// removed entirely -- those flows scaffolded/built packages directly from Home, duplicating what the
// CLI itself already does better: run
// `pokie init [directory]` for a prepared, immediately valid package, or `pokie create [name]` for an
// editable Blueprint Project. There used to be a second, independent, always-mounted
// `<BlueprintEditorPage />` instance here too (the "raw"/non-guided Blueprint Editor) -- since HomePage
// keeps every tab body permanently mounted (see below), that meant two entirely separate
// useBlueprintEditor() drafts alive at once, with no relationship to each other. Design Game's own JSON
// mode and Load/Save-by-path (tucked behind its "Show advanced options" disclosure, see
// BlueprintEditorPage's own `guided` doc comment) already cover everything the raw editor offered.
//
// The active tab comes from the URL (`/home/:tab`, see routes.tsx), not local state, so refresh/back-
// forward/direct links land on the right section -- an unrecognized or missing `:tab` (e.g. this page
// rendered directly in a test outside a matching route) falls back to "design". Both tab bodies stay
// permanently mounted (hidden via CSS, never unmounted) so switching tabs never destroys in-progress
// Blueprint Editor state -- same "don't unmount, hide" principle ProjectDashboardPage's own tabs rely on,
// applied directly to the tab bodies here since BlueprintEditorPage's state is non-trivial.
//
// `location.state?.initialBlueprintPath`, when set by a caller, lands on the right tab already loading
// the given blueprint. `location.state?.initialParSheetPath` is the same idea for Projects' own "Import
// Project" -> PAR sheet routing (see ProjectsPanel's `handleGoToDesignGame`).
export function HomePage() {
    // The provider must be above every hook that opens a project, including Home's own
    // retained-job Retry. Wrapping only its rendered JobCard cannot guard that hook's context.
    const [isDesignDirty, setIsDesignDirty] = useState(false);
    const navigationGuard = useDesignNavigationGuard(isDesignDirty);
    return (
        <DesignNavigationGuardProvider value={navigationGuard}>
            <HomePageContent onDirtyChange={setIsDesignDirty} />
        </DesignNavigationGuardProvider>
    );
}

function HomePageContent({onDirtyChange}: {onDirtyChange: (dirty: boolean) => void}) {
    const fetchImpl = useStudioApi();
    const navigate = useNavigate();
    const {tab} = useParams<{tab: string}>();
    const activeTab: HomeTab = isHomeTab(tab) ? tab : "design";
    const activeTabLabel = HOME_TABS.find((item) => item.value === activeTab)?.label ?? "Start a game";
    useDocumentTitle(`${activeTabLabel} · POKIE Studio`);

    // Keep the address bar aligned with the fallback view too. Without this replacement an invalid
    // direct link renders Design Game but leaves an unusable /home/:tab history entry behind.
    useEffect(() => {
        if (!isHomeTab(tab)) {
            navigate("/home/design", {replace: true});
        }
    }, [navigate, tab]);

    const location = useLocation() as {state?: {initialBlueprintPath?: string; initialParSheetPath?: string; recoverParImport?: boolean; recoveryRequest?: Readonly<Record<string, unknown>>; initialBuildOutDir?: string}};
    const initialBlueprintPath = location.state?.initialBlueprintPath;
    const initialParSheetPath = location.state?.initialParSheetPath;

    const designRef = useRef<HTMLDivElement>(null);
    const projectsRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        // Focus moves into the selected Home region for keyboard/screen-reader orientation, but it must
        // not drag the page down on first load. The explicit scroll-to-top keeps the page header and the
        // "Design Your Game" intro visible when this route is opened fresh.
        window.scrollTo(0, 0);
        (activeTab === "design" ? designRef : projectsRef).current?.focus({preventScroll: true});
    }, [activeTab]);

    const [projectRegistryVersion, setProjectRegistryVersion] = useState(0);
    const [justSavedManagedProject, setJustSavedManagedProject] = useState<StudioProjectRegistryView | undefined>(undefined);
    const openAndNavigate = useOpenProject();
    const openingGuard = useDoubleSubmitGuard();
    const [openingProject, setOpeningProject] = useState(false);
    const [recoveryOpeningError, setRecoveryOpeningError] = useState<string>();
    const [jobOutputNotice, setJobOutputNotice] = useState<string>();
    const [jobOutputActionsUnavailableReason, setJobOutputActionsUnavailableReason] = useState<string>();
    const [dismissingHomeJobs, setDismissingHomeJobs] = useState<string[]>([]);
    const [dismissHomeJobsError, setDismissHomeJobsError] = useState<string>();
    // Home does not have a current project identity.  The server therefore returns only Design and
    // project-opening records here, including retained terminal records after a reload.
    const homeJobs = useHomeSourceJobs(fetchImpl);
    const refreshHomeJobs = () => {
        homeJobs.refresh().catch(() => undefined);
    };
    const dismissHomeJobs = (ids: string[]): void => {
        const pending = ids.filter(id => !dismissingHomeJobs.includes(id));
        if (pending.length === 0) return;
        setDismissingHomeJobs(previous => [...previous, ...pending]);
        setDismissHomeJobsError(undefined);
        Promise.allSettled(pending.map(id => dismissHomeSourceJob(fetchImpl, id))).then(async results => {
            const failed = results.flatMap((result, index) => result.status === "rejected" ? [pending[index]!] : []);
            const removed = pending.filter((_id, index) => results[index]?.status === "fulfilled");
            homeJobs.forget(removed);
            await homeJobs.refresh().catch(() => undefined);
            if (failed.length > 0) {
                setDismissHomeJobsError(`Couldn't dismiss ${failed.length === 1 ? "one finished job" : `${failed.length} finished jobs`}. ${errorMessage(results.find(result => result.status === "rejected")?.reason)}`);
            }
        }).finally(() => {
            setDismissingHomeJobs(previous => previous.filter(id => !pending.includes(id)));
        });
    };
    const openingDisabledReason = (job: StudioJobView): string | undefined => {
        if (job.operation !== "project-open-materialization") return undefined;
        if (openingProject) return "Project opening is pending. Finish any confirmation, or wait for its result.";
        // A retained terminal is history, not permission to race a later opening. This also
        // covers a reload, where the original browser promise no longer exists.
        if (homeJobs.jobs.some(candidate => candidate.conflictKey === job.conflictKey &&
            (candidate.status === "queued" || candidate.status === "running" || candidate.status === "cancelling"))) {
            return "Project opening is active for this source. Wait for its result or cancel the active job before retrying.";
        }
        return undefined;
    };
    const reopenProject = (sourcePath: string, job: StudioJobView): void => {
        if (openingDisabledReason(job) !== undefined || !openingGuard.begin()) return;
        setOpeningProject(true);
        setRecoveryOpeningError(undefined);
        openAndNavigate(sourcePath).catch((error: unknown) => {
            setRecoveryOpeningError(error instanceof ProjectOpenInProgressError
                ? `This project is already opening (job ${error.jobId}). Wait for the active opening to finish, then use Retry again.`
                : `Couldn't reopen the saved project "${sourcePath}". ${errorMessage(error)} Retry if the source is available, or use Projects to Relocate it to its current location or add the game again.`);
        }).finally(() => {
            openingGuard.end();
            setOpeningProject(false);
        });
    };
    useEffect(() => {
        let cancelled = false;
        checkNativePickerAvailability(fetchImpl)
            .then((view) => {
                if (!cancelled) setJobOutputActionsUnavailableReason(view.status === "unavailable" ? view.reason : undefined);
            })
            .catch(() => {
                if (!cancelled) setJobOutputActionsUnavailableReason("This Studio session cannot confirm access to its server's local output.");
            });
        return () => {
            cancelled = true;
        };
    }, [fetchImpl]);
    const handleHomeRecoveryAction = (job: StudioJobView): void => {
        // Recovery never silently replays a retained write.  Re-open the
        // owning workflow with its captured source so the user can inspect
        // the reconstructed operation and explicitly submit it again.
        if (job.operation === "project-open-materialization" && typeof job.request.sourcePath === "string") {
            reopenProject(job.request.sourcePath, job);
            return;
        }
        if (job.operation === "design-par-import" && typeof job.request.path === "string") {
            navigate("/home/design", {state: {initialParSheetPath: job.request.path, recoverParImport: true, recoveryRequest: {...job.request}}});
            return;
        }
        if ((job.operation === "design-build" || job.operation === "design-par-export") && (job.request.blueprint !== undefined || typeof job.request.sourcePath === "string")) {
            navigate("/home/design", {state: {
                initialBlueprintPath: typeof job.request.sourcePath === "string" ? job.request.sourcePath : undefined,
                recoveryRequest: {...job.request},
                initialBuildOutDir: job.operation === "design-build" && typeof job.request.destinationPath === "string" ? job.request.destinationPath : undefined,
            }});
        }
    };

    const renderHomeJob = (job: StudioJobView) => (
        <JobCard key={job.id} job={job} cancellationPending={homeJobs.pendingIds.includes(job.id)} onCancel={homeJobs.cancel} onRecover={homeJobs.recover} onRecoveryAction={handleHomeRecoveryAction} onOpenOutput={(outputPath) => {
            if (job.operation === "project-open-materialization") {
                reopenProject(outputPath, job);
                return;
            }
            openOutputFolder(fetchImpl, outputPath).then((result) => {
                setJobOutputNotice(describeJobOutputAction(result, "Opened job output."));
            }).catch(() => setJobOutputNotice("Couldn't open the job output."));
        }} onRevealOutput={job.operation === "project-open-materialization" && jobOutputActionsUnavailableReason !== undefined ? undefined : (outputPath) => {
            revealOutputPath(fetchImpl, outputPath).then((result) => {
                setJobOutputNotice(describeJobOutputAction(result, "Revealed job output."));
            }).catch(() => setJobOutputNotice("Couldn't reveal the job output."));
        }} outputActionsUnavailableReason={job.operation === "project-open-materialization" ? undefined : jobOutputActionsUnavailableReason}
        onDismiss={(id) => dismissHomeJobs([id])}
        actionsDisabledReason={openingDisabledReason(job) ?? (dismissingHomeJobs.includes(job.id) ? "Dismissing this finished job…" : undefined)} />
    );
    const {active: activeHomeJobs, needsAttention: needsAttentionHomeJobs, archived: archivedHomeJobs} = groupHomeJobs(homeJobs.jobs);
    const hasHomeJobAttention = activeHomeJobs.length > 0 ||
        needsAttentionHomeJobs.length > 0 ||
        homeJobs.connectionError !== undefined ||
        homeJobs.actionError !== undefined ||
        recoveryOpeningError !== undefined ||
        jobOutputNotice !== undefined ||
        homeJobs.jobs.some((job) => job.result?.outputs?.some((output) => output.unavailableReason !== undefined));
    const finishedJobsOnly = archivedHomeJobs.length > 0 && !hasHomeJobAttention;

    let homeJobsPanel: ReactNode;
    if (homeJobs.discoveryStatus !== "pending" && homeJobs.jobs.length === 0 && homeJobs.connectionError === undefined && homeJobs.actionError === undefined) {
        homeJobsPanel = undefined;
    } else if (finishedJobsOnly) {
        homeJobsPanel = (
            <details style={{marginTop: "var(--mantine-spacing-lg)"}}>
                <summary>Advanced: older finished jobs ({archivedHomeJobs.length})</summary>
                <Stack gap="xs" mt="xs">{archivedHomeJobs.map(renderHomeJob)}</Stack>
            </details>
        );
    } else {
        const hasUnavailableOutput = homeJobs.jobs.some((job) => job.result?.outputs?.some((output) => output.unavailableReason !== undefined));
        const hasBackgroundDetails = archivedHomeJobs.length > 0 || hasUnavailableOutput;
        homeJobsPanel = (
            <Stack gap="xs" mt="lg" aria-label="Home jobs">
                {activeHomeJobs.length > 0 && <Title order={3}>Active jobs</Title>}
                <JobObservationNotice discoveryStatus={homeJobs.discoveryStatus} connectionError={homeJobs.connectionError} actionError={homeJobs.actionError} onReattach={homeJobs.refresh} />
                {recoveryOpeningError !== undefined && <Alert role="alert" color="red">{recoveryOpeningError}</Alert>}
                {activeHomeJobs.map(renderHomeJob)}
                {needsAttentionHomeJobs.length > 0 && (
                    <>
                        <Title order={3}>Needs attention</Title>
                        <Text size="sm" c="dimmed">
                            These operations stopped before confirming a result. Retry the interrupted opening, or review the job details.
                        </Text>
                        {needsAttentionHomeJobs.map(renderHomeJob)}
                        <Button variant="default" size="xs" loading={needsAttentionHomeJobs.some(job => dismissingHomeJobs.includes(job.id))} onClick={() => dismissHomeJobs(needsAttentionHomeJobs.map(job => job.id))}>
                            Dismiss finished jobs
                        </Button>
                    </>
                )}
                {(recoveryOpeningError !== undefined || hasUnavailableOutput) &&
                    <Button variant="default" onClick={() => navigate("/home/projects")}>Find saved project in Projects</Button>}
                {hasBackgroundDetails && (
                    <details>
                        <summary>
                            {archivedHomeJobs.length > 0
                                ? `Advanced: background work and finished jobs (${archivedHomeJobs.length})`
                                : "Advanced: background work"}
                        </summary>
                        <Stack gap="xs" mt="xs">
                            <Text size="sm" c="dimmed">Finished jobs stay available here; active work remains visible above.</Text>
                            {archivedHomeJobs.map(renderHomeJob)}
                            <Button variant="subtle" size="xs" loading={archivedHomeJobs.some(job => dismissingHomeJobs.includes(job.id))} onClick={() => dismissHomeJobs(archivedHomeJobs.map(job => job.id))}>
                                Clear finished job history
                            </Button>
                            {hasUnavailableOutput &&
                                <Button variant="default" onClick={() => navigate("/home/projects")}>Find saved project in Projects</Button>}
                        </Stack>
                    </details>
                )}
                {jobOutputNotice !== undefined && <Text size="xs" aria-live="polite" c="dimmed">{jobOutputNotice}</Text>}
                {dismissHomeJobsError !== undefined && <Alert role="alert" color="red">{dismissHomeJobsError}</Alert>}
            </Stack>
        );
    }

    return (
        <AppShellLayout
            onHomeClick={() => navigate("/home/design")}
            navbar={<NavTabs items={HOME_TABS} active={activeTab} onSelect={(value) => {
                // A selected section is already the live rendered state.  Do
                // not manufacture a second history transition from a repeat
                // native click; the next distinct tab remains the one public
                // navigation action that changes Home's route.
                if (value !== activeTab) navigate(`/home/${value}`);
            }} />}
            breadcrumbs={[]}
        >
            <Stack className="studio-page" gap="lg">
                <Text className="studio-intro" size="sm" c="dimmed">
                    Design a game, check exact RTP, simulate, play, and export a PAR sheet — no code needed for
                    those steps. This is a local authoring tool; it does not deploy or certify a game for real-money
                    use. TypeScript and WASM are developer outputs.
                </Text>
                <div id="home-design-panel" ref={designRef} role="region" aria-labelledby="design-game-heading" tabIndex={-1} style={{display: activeTab === "design" ? undefined : "none"}}>
                    <BlueprintEditorPage
                        guided
                        initialPath={initialBlueprintPath}
                        initialParSheetPath={initialParSheetPath}
                        recoverParImport={location.state?.recoverParImport}
                        recoveryRequest={location.state?.recoveryRequest}
                        recoveryGuardedByNavigation
                        initialBuildOutDir={location.state?.initialBuildOutDir}
                        onDirtyChange={onDirtyChange}
                        isVisible={activeTab === "design"}
                        onManagedProjectSaved={(registeredProject) => {
                            setJustSavedManagedProject(registeredProject);
                            setProjectRegistryVersion((version) => version + 1);
                        }}
                        onParImportSettled={refreshHomeJobs}
                    />
                </div>

                <div id="home-projects-panel" ref={projectsRef} role="region" aria-labelledby="projects-heading" tabIndex={-1} style={{display: activeTab === "projects" ? undefined : "none"}}>
                    <Stack gap="md">
                        <Title id="projects-heading" order={2}>Projects</Title>
                        <Text c="dimmed" size="sm">
                            Return to a game you already started, or add a game you made elsewhere. Open a game to play, test, and export it.
                        </Text>
                        <Text c="dimmed" size="sm">
                            New here? Go to Start a game to begin with a ready-to-edit starter, a blank design, or a generated template.
                        </Text>
                        <ProjectsPanel
                            registryVersion={projectRegistryVersion}
                            registeredProject={justSavedManagedProject}
                            isVisible={activeTab === "projects"}
                        />
                    </Stack>
                </div>

                {homeJobsPanel}

                <HomeProjectJobs />

                <Text size="md" fw={500} c="dimmed">
                    POKIE Studio runs locally on this computer. Keep the terminal window that started it open while
                    you work; closing that window stops the local server.
                </Text>

                <DocumentationLinks />
            </Stack>
        </AppShellLayout>
    );
}
