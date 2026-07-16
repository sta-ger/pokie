import {Divider, Stack, Text, Title} from "@mantine/core";
import {useDocumentTitle} from "@mantine/hooks";
import {useEffect, useRef, useState} from "react";
import {useLocation, useNavigate, useParams} from "react-router-dom";
import {BlueprintEditorPage} from "../blueprintEditor/BlueprintEditorPage";
import {DesignNavigationGuardProvider} from "../../context/DesignNavigationGuardContext";
import {useDesignNavigationGuard} from "../../hooks/useDesignNavigationGuard";
import {AppShellLayout} from "../layout/AppShellLayout";
import {NavTabs, type NavTabItem} from "../layout/NavTabs";
import {BuildFromBlueprintPanel} from "./BuildFromBlueprintPanel";
import {CreateProjectForm} from "./CreateProjectForm";
import {DocumentationLinks} from "./DocumentationLinks";
import {InitProjectForm} from "./InitProjectForm";
import {OpenProjectForm} from "./OpenProjectForm";
import {RecentProjectsPanel} from "./RecentProjectsPanel";

export type HomeTab = "design" | "open" | "advanced";

const HOME_TABS: NavTabItem<HomeTab>[] = [
    {value: "design", label: "Design & Build"},
    {value: "open", label: "Open Project"},
    {value: "advanced", label: "Advanced Tools"},
];

function isHomeTab(value: string | undefined): value is HomeTab {
    return HOME_TABS.some((tab) => tab.value === value);
}

// Task-oriented Home: 3 tabs instead of the previous 6 flat, module-named ones. "Design & Build" is the
// primary happy path (open-or-create a blueprint -> configure the game model -> validate -> build ->
// land in the Project Dashboard) and is the default tab; "Open Project" merges what were two separate
// "ways to open an already-built project" tabs (Recent Projects, Open Existing Project) into one; every
// other tool (hand-coded scaffold, init-in-place, build-from-an-existing-blueprint-file, the raw/
// non-guided Blueprint Editor) moves to "Advanced Tools" -- still fully functional, just not featured.
//
// The active tab comes from the URL (`/home/:tab`, see routes.tsx), not local state, so refresh/back-
// forward/direct links land on the right section -- an unrecognized or missing `:tab` (e.g. this page
// rendered directly in a test outside a matching route) falls back to "design". All 3 tab bodies stay
// permanently mounted (hidden via CSS, never unmounted) so switching tabs never destroys in-progress
// Blueprint Editor state -- same "don't unmount, hide" principle ProjectDashboardPage's own tabs rely on,
// applied directly to the tab bodies here since BlueprintEditorPage's state is non-trivial.
//
// `location.state?.initialBlueprintPath` is how Project Overview's "Configure Game Model" link (see
// ProjectDashboardPage's onConfigureGameModel) sends the user back here already on the right tab with
// the right blueprint loading.
export function HomePage() {
    const navigate = useNavigate();
    const {tab} = useParams<{tab: string}>();
    const activeTab: HomeTab = isHomeTab(tab) ? tab : "design";
    const activeTabLabel = HOME_TABS.find((item) => item.value === activeTab)?.label ?? "Design & Build";
    useDocumentTitle(`${activeTabLabel} · POKIE Studio`);

    const location = useLocation() as {state?: {initialBlueprintPath?: string}};
    const initialBlueprintPath = location.state?.initialBlueprintPath;

    const designRef = useRef<HTMLDivElement>(null);
    const openRef = useRef<HTMLDivElement>(null);
    const advancedRef = useRef<HTMLDivElement>(null);
    const panelRefs: Record<HomeTab, typeof designRef> = {design: designRef, open: openRef, advanced: advancedRef};
    useEffect(() => {
        panelRefs[activeTab].current?.focus();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab]);

    // Fed by the guided BlueprintEditorPage instance's own onDirtyChange -- reactive state (not a ref)
    // since useDesignNavigationGuard's beforeunload effect needs to actually see it change to
    // attach/detach the listener; only flips true/false on New/Load/Save/Build, not per keystroke, so
    // this doesn't cause excess re-renders.
    const [isDesignDirty, setIsDesignDirty] = useState(false);
    const guardedAction = useDesignNavigationGuard(isDesignDirty);

    return (
        <AppShellLayout
            navbar={<NavTabs items={HOME_TABS} active={activeTab} onSelect={(value) => navigate(`/home/${value}`)} />}
            breadcrumbs={[]}
        >
            <DesignNavigationGuardProvider value={guardedAction}>
                <Stack gap="lg">
                    <div ref={designRef} tabIndex={-1} style={{display: activeTab === "design" ? undefined : "none"}}>
                        <BlueprintEditorPage guided initialPath={initialBlueprintPath} onDirtyChange={setIsDesignDirty} />
                    </div>

                    <div ref={openRef} tabIndex={-1} style={{display: activeTab === "open" ? undefined : "none"}}>
                        <Stack gap="md">
                            <Title order={2}>Open a Project</Title>
                            <Text c="dimmed" size="sm">
                                Open an already-built project to inspect, validate, simulate, or deploy it.
                            </Text>
                            <RecentProjectsPanel />
                            <Divider label="Or open by path" labelPosition="left" />
                            <OpenProjectForm />
                        </Stack>
                    </div>

                    <div ref={advancedRef} tabIndex={-1} style={{display: activeTab === "advanced" ? undefined : "none"}}>
                        <Stack gap="lg">
                            <Title order={2}>Advanced Tools</Title>
                            <Text c="dimmed" size="sm">
                                Everything outside the guided Design &amp; Build flow: scaffolding hand-coded games, initializing an
                                existing directory in place, building from a blueprint file directly, and the raw Blueprint Editor.
                            </Text>

                            <div>
                                <Title order={4} mb="xs">
                                    Scaffold a hand-coded game
                                </Title>
                                <Text c="dimmed" size="sm" mb="sm">
                                    Generates hand-written TypeScript game logic (no blueprint/game model) -- for building game logic
                                    by hand rather than declaratively.
                                </Text>
                                <CreateProjectForm />
                            </div>

                            <Divider />

                            <div>
                                <Title order={4} mb="xs">
                                    Initialize an existing directory
                                </Title>
                                <InitProjectForm />
                            </div>

                            <Divider />

                            <div>
                                <Title order={4} mb="xs">
                                    Build from an existing blueprint file
                                </Title>
                                <Text c="dimmed" size="sm" mb="sm">
                                    Skips the guided editor -- builds directly from a blueprint JSON file already on disk.
                                </Text>
                                <BuildFromBlueprintPanel />
                            </div>

                            <Divider />

                            <div>
                                <Title order={4} mb="xs">
                                    Raw Blueprint Editor
                                </Title>
                                <Text c="dimmed" size="sm" mb="sm">
                                    The Blueprint Editor without the guided step-by-step framing -- JSON mode and Load/Save-by-path
                                    are always visible.
                                </Text>
                                <BlueprintEditorPage />
                            </div>
                        </Stack>
                    </div>

                    <Divider />
                    <DocumentationLinks />
                </Stack>
            </DesignNavigationGuardProvider>
        </AppShellLayout>
    );
}
