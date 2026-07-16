import {Divider, Stack} from "@mantine/core";
import {useState} from "react";
import {BlueprintEditorPage} from "../blueprintEditor/BlueprintEditorPage";
import {AppShellLayout} from "../layout/AppShellLayout";
import {NavTabs, type NavTabItem} from "../layout/NavTabs";
import {BuildFromBlueprintPanel} from "./BuildFromBlueprintPanel";
import {CreateProjectForm} from "./CreateProjectForm";
import {DocumentationLinks} from "./DocumentationLinks";
import {InitProjectForm} from "./InitProjectForm";
import {OpenProjectForm} from "./OpenProjectForm";
import {RecentProjectsPanel} from "./RecentProjectsPanel";

export type HomeTab = "recent" | "create" | "init" | "build" | "open" | "blueprint-editor";

const HOME_TABS: NavTabItem<HomeTab>[] = [
    {value: "recent", label: "Recent Projects"},
    {value: "create", label: "Create Project"},
    {value: "init", label: "Initialize Project"},
    {value: "build", label: "Build from Blueprint"},
    {value: "open", label: "Open Existing Project"},
    {value: "blueprint-editor", label: "Blueprint Editor"},
];

export function HomePage() {
    const [activeTab, setActiveTab] = useState<HomeTab>("recent");

    return (
        <AppShellLayout navbar={<NavTabs items={HOME_TABS} active={activeTab} onSelect={setActiveTab} />}>
            <Stack gap="lg">
                {activeTab === "recent" && <RecentProjectsPanel />}
                {activeTab === "create" && <CreateProjectForm />}
                {activeTab === "init" && <InitProjectForm />}
                {activeTab === "build" && <BuildFromBlueprintPanel />}
                {activeTab === "open" && <OpenProjectForm />}
                {activeTab === "blueprint-editor" && <BlueprintEditorPage />}

                <Divider />
                <DocumentationLinks />
            </Stack>
        </AppShellLayout>
    );
}
