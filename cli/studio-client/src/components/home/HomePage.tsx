import {Code, Stack, Text, Title} from "@mantine/core";
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
import type {StudioProjectRegistryView} from "../../api/types";

export type HomeTab = "design" | "projects";

const HOME_TABS: NavTabItem<HomeTab>[] = [
    {value: "design", label: "Design Game"},
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
    const navigate = useNavigate();
    const {tab} = useParams<{tab: string}>();
    const activeTab: HomeTab = isHomeTab(tab) ? tab : "design";
    const activeTabLabel = HOME_TABS.find((item) => item.value === activeTab)?.label ?? "Design Game";
    useDocumentTitle(`${activeTabLabel} · POKIE Studio`);

    // Keep the address bar aligned with the fallback view too. Without this replacement an invalid
    // direct link renders Design Game but leaves an unusable /home/:tab history entry behind.
    useEffect(() => {
        if (!isHomeTab(tab)) {
            navigate("/home/design", {replace: true});
        }
    }, [navigate, tab]);

    const location = useLocation() as {state?: {initialBlueprintPath?: string; initialParSheetPath?: string}};
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
    const guardedAction = useDesignNavigationGuard(isDesignDirty);

    return (
        <AppShellLayout
            navbar={<NavTabs items={HOME_TABS} active={activeTab} onSelect={(value) => navigate(`/home/${value}`)} />}
            breadcrumbs={[]}
        >
            <DesignNavigationGuardProvider value={guardedAction}>
                <Stack gap="lg">
                    <div ref={designRef} tabIndex={-1} style={{display: activeTab === "design" ? undefined : "none"}}>
                        <BlueprintEditorPage
                            guided
                            initialPath={initialBlueprintPath}
                            initialParSheetPath={initialParSheetPath}
                            onDirtyChange={setIsDesignDirty}
                            isVisible={activeTab === "design"}
                            onManagedProjectSaved={(registeredProject) => {
                                setJustSavedManagedProject(registeredProject);
                                setProjectRegistryVersion((version) => version + 1);
                            }}
                        />
                    </div>

                    <div ref={projectsRef} tabIndex={-1} style={{display: activeTab === "projects" ? undefined : "none"}}>
                        <Stack gap="md">
                            <Title order={2}>Projects</Title>
                            <Text c="dimmed" size="sm">
                                Open an already-known project to inspect, validate, simulate, or deploy it, or import one POKIE doesn&apos;t
                                know about yet.
                            </Text>
                            <Text c="dimmed" size="sm">
                                Need a new project from your terminal? Run <Code>pokie init</Code> for a ready-to-build package, or{" "}
                                <Code>pokie create</Code> for an editable Blueprint Project -- then import it above.
                            </Text>
                            <ProjectsPanel
                                registryVersion={projectRegistryVersion}
                                registeredProject={justSavedManagedProject}
                                isVisible={activeTab === "projects"}
                            />
                        </Stack>
                    </div>

                    <DocumentationLinks />
                </Stack>
            </DesignNavigationGuardProvider>
        </AppShellLayout>
    );
}
