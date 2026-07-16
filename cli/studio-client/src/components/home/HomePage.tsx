import {Divider, Stack, Text, Title} from "@mantine/core";
import {useDocumentTitle} from "@mantine/hooks";
import {useState} from "react";
import {useLocation} from "react-router-dom";
import {BlueprintEditorPage} from "../blueprintEditor/BlueprintEditorPage";
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

// Task-oriented Home: 3 tabs instead of the previous 6 flat, module-named ones. "Design & Build" is the
// primary happy path (open-or-create a blueprint -> configure the game model -> validate -> build ->
// land in the Project Dashboard) and is the default tab; "Open Project" merges what were two separate
// "ways to open an already-built project" tabs (Recent Projects, Open Existing Project) into one; every
// other tool (hand-coded scaffold, init-in-place, build-from-an-existing-blueprint-file, the raw/
// non-guided Blueprint Editor) moves to "Advanced Tools" -- still fully functional, just not featured.
//
// `location.state?.initialBlueprintPath` is how Project Overview's "Configure Game Model" link (see
// ProjectDashboardPage's onConfigureGameModel) sends the user back here already on the right tab with
// the right blueprint loading.
export function HomePage() {
    useDocumentTitle("POKIE Studio");
    const location = useLocation() as {state?: {initialBlueprintPath?: string}};
    const initialBlueprintPath = location.state?.initialBlueprintPath;
    const [activeTab, setActiveTab] = useState<HomeTab>("design");

    return (
        <AppShellLayout navbar={<NavTabs items={HOME_TABS} active={activeTab} onSelect={setActiveTab} />} breadcrumbs={[]}>
            <Stack gap="lg">
                {activeTab === "design" && <BlueprintEditorPage guided initialPath={initialBlueprintPath} />}

                {activeTab === "open" && (
                    <Stack gap="md">
                        <Title order={2}>Open a Project</Title>
                        <Text c="dimmed" size="sm">
                            Open an already-built project to inspect, validate, simulate, or deploy it.
                        </Text>
                        <RecentProjectsPanel />
                        <Divider label="Or open by path" labelPosition="left" />
                        <OpenProjectForm />
                    </Stack>
                )}

                {activeTab === "advanced" && (
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
                                Generates hand-written TypeScript game logic (no blueprint/game model) -- for building game logic by
                                hand rather than declaratively.
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
                                The Blueprint Editor without the guided step-by-step framing -- JSON mode and Load/Save-by-path are
                                always visible.
                            </Text>
                            <BlueprintEditorPage />
                        </div>
                    </Stack>
                )}

                <Divider />
                <DocumentationLinks />
            </Stack>
        </AppShellLayout>
    );
}
