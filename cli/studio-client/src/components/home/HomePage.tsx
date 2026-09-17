import {Stack, Text, Title} from "@mantine/core";
import {useDocumentTitle} from "@mantine/hooks";
import {useEffect, useRef, useState} from "react";
import {useLocation, useNavigate, useParams} from "react-router-dom";
import {BlueprintEditorPage} from "../blueprintEditor/BlueprintEditorPage";
import {DesignNavigationGuardProvider} from "../../context/DesignNavigationGuardContext";
import {useDesignNavigationGuard} from "../../hooks/useDesignNavigationGuard";
import {AppShellLayout} from "../layout/AppShellLayout";
import {NavTabs, type NavTabItem} from "../layout/NavTabs";
import {DocumentationLinks} from "./DocumentationLinks";
import {ProjectsPanel} from "./ProjectsPanel";
import type {StudioJobView, StudioProjectRegistryView} from "../../api/types";
import {openOutputFolder} from "../../api/apiClient";
import {useStudioApi} from "../../context/StudioApiProvider";
import {useHomeSourceJobs} from "../../hooks/useHomeSourceJobs";
import {JobProgressCard} from "../common/JobProgressCard";
import {JobResultCard} from "../common/JobResultCard";
import {useOpenProject} from "../../hooks/useOpenProject";

export type HomeTab = "design" | "projects";

const HOME_TABS: NavTabItem<HomeTab>[] = [
    {value: "design", label: "Start a game"},
    {value: "projects", label: "Projects"},
];

function isHomeTab(value: string | undefined): value is HomeTab {
    return HOME_TABS.some((tab) => tab.value === value);
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
// removed entirely -- those flows scaffolded/built via GamePackageCreator/GamePackageScaffolder/
// GamePackageGenerator directly from Home, duplicating what the CLI itself already does better: run
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

    const location = useLocation() as {state?: {initialBlueprintPath?: string; initialParSheetPath?: string; recoverParImport?: boolean; recoveryRequest?: Readonly<Record<string, unknown>>}};
    const initialBlueprintPath = location.state?.initialBlueprintPath;
    const initialParSheetPath = location.state?.initialParSheetPath;

    const designRef = useRef<HTMLDivElement>(null);
    const projectsRef = useRef<HTMLDivElement>(null);
    const panelRefs: Record<HomeTab, typeof designRef> = {design: designRef, projects: projectsRef};
    useEffect(() => {
        panelRefs[activeTab].current?.focus();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab]);

    // Fed by the guided BlueprintEditorPage instance's own onDirtyChange -- reactive state (not a ref)
    // since useDesignNavigationGuard's beforeunload effect needs to actually see it change to
    // attach/detach the listener; only flips true/false on New/Load/Save/Build, not per keystroke, so
    // this doesn't cause excess re-renders.
    const [isDesignDirty, setIsDesignDirty] = useState(false);
    const [projectRegistryVersion, setProjectRegistryVersion] = useState(0);
    const [justSavedManagedProject, setJustSavedManagedProject] = useState<StudioProjectRegistryView | undefined>(undefined);
    const navigationGuard = useDesignNavigationGuard(isDesignDirty);
    const openAndNavigate = useOpenProject();
    // Home does not have a current project identity.  The server therefore returns only Design and
    // project-opening records here, including retained terminal records after a reload.
    const homeJobs = useHomeSourceJobs(fetchImpl);
    const handleHomeRecoveryAction = (job: StudioJobView): void => {
        // Recovery never silently replays a retained write.  Re-open the
        // owning workflow with its captured source so the user can inspect
        // the reconstructed operation and explicitly submit it again.
        if (job.operation === "project-open-materialization" && typeof job.request.sourcePath === "string") {
            openAndNavigate(job.request.sourcePath).catch(() => undefined);
            return;
        }
        if (job.operation === "design-par-import" && typeof job.request.path === "string") {
            navigate("/home/design", {state: {initialParSheetPath: job.request.path, recoverParImport: true, recoveryRequest: job.request}});
            return;
        }
        if ((job.operation === "design-build" || job.operation === "design-par-export") && typeof job.request.sourcePath === "string") {
            navigate("/home/design", {state: {initialBlueprintPath: job.request.sourcePath, recoveryRequest: job.request}});
        }
    };

    const homeJobsPanel = homeJobs.jobs.length === 0 ? undefined : (
        <Stack gap="xs" mt="lg" aria-label="Home jobs">
            <Title order={3}>Home jobs</Title>
            <Text size="sm" c="dimmed">Retained Design and project-opening work stays visible on every Home section after a reload. Cancel active work or reconstruct a server-supported recovery.</Text>
            {homeJobs.jobs.map((job) =>
                job.status === "queued" || job.status === "running" || job.status === "cancelling"
                    ? <JobProgressCard key={job.id} job={job} onCancel={homeJobs.cancel} />
                    : <JobResultCard key={job.id} job={job} onRecover={homeJobs.recover} onRecoveryAction={handleHomeRecoveryAction} onOpenOutput={(outputPath) => {
                        openOutputFolder(fetchImpl, outputPath).catch(() => undefined);
                    }} />,
            )}
        </Stack>
    );

    return (
        <AppShellLayout
            navbar={<NavTabs items={HOME_TABS} active={activeTab} onSelect={(value) => navigate(`/home/${value}`)} />}
            breadcrumbs={[]}
        >
            <DesignNavigationGuardProvider value={navigationGuard}>
                <Stack gap="lg">
                    <div ref={designRef} role="region" aria-labelledby="design-game-heading" tabIndex={-1} style={{display: activeTab === "design" ? undefined : "none"}}>
                        <BlueprintEditorPage
                            guided
                            initialPath={initialBlueprintPath}
                            initialParSheetPath={initialParSheetPath}
                            recoverParImport={location.state?.recoverParImport}
                            recoveryRequest={location.state?.recoveryRequest}
                            onDirtyChange={setIsDesignDirty}
                            isVisible={activeTab === "design"}
                            onManagedProjectSaved={(registeredProject) => {
                                setJustSavedManagedProject(registeredProject);
                                setProjectRegistryVersion((version) => version + 1);
                            }}
                        />
                    </div>

                    <div ref={projectsRef} role="region" aria-labelledby="projects-heading" tabIndex={-1} style={{display: activeTab === "projects" ? undefined : "none"}}>
                        <Stack gap="md">
                            <Title id="projects-heading" order={2}>Projects</Title>
                            <Text c="dimmed" size="sm">
                                Return to a game you already started, or add a game you made elsewhere. Open a game to play, test, and export it.
                            </Text>
                            <Text c="dimmed" size="sm">
                                New here? Go to Start a game to begin with a ready-to-edit starter, a blank design, or a generated idea.
                            </Text>
                            <ProjectsPanel
                                registryVersion={projectRegistryVersion}
                                registeredProject={justSavedManagedProject}
                                isVisible={activeTab === "projects"}
                            />
                        </Stack>
                    </div>

                    {homeJobsPanel}

                    <DocumentationLinks />
                </Stack>
            </DesignNavigationGuardProvider>
        </AppShellLayout>
    );
}
