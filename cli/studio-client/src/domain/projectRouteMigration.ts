// Pure, testable project-tab routing/migration policy. Keeping it out of the React page avoids
// importing JSX just to answer "is this URL a retired tab or a path-shaped upgrade?".
export type ProjectTab =
    | "overview"
    | "gameModel"
    | "play"
    | "simulation"
    | "replay"
    | "exportDeploy"
    | "certification"
    | "provablyFair";

const PROJECT_TABS: readonly ProjectTab[] = [
    "overview",
    "gameModel",
    "play",
    "simulation",
    "replay",
    "exportDeploy",
    "certification",
    "provablyFair",
];

export function isProjectTab(value: string | undefined): value is ProjectTab {
    return PROJECT_TABS.some((tab) => tab === value);
}

// A scoped project URL contains the project path as one encoded segment. Some browser/router
// upgrades end up passing the path plus the real tab through the legacy single-segment route
// (`/project/:tab`), which used to look like an unknown tab and produced the alarming
// "section is no longer available" notice even though the section existed. Recover the trailing
// tab when the value is path-shaped; a genuinely unknown single word still gets the explicit
// unavailable message below.
function trailingProjectTab(value: string | undefined): ProjectTab | undefined {
    if (value === undefined) return undefined;
    const parts = value.split("/").filter((part) => part.length > 0);
    const last = parts[parts.length - 1];
    return isProjectTab(last) ? last : undefined;
}

export type LegacyProjectRouteMigration = {destination: ProjectTab; message?: string};

export function legacyProjectRouteMigration(tab: string | undefined): LegacyProjectRouteMigration | undefined {
    // A retained route is already its own canonical destination. Keeping this guard here (rather
    // than at every caller) also prevents LegacyProjectDashboardRoute from adding `?migrated=` to
    // ordinary legacy links such as /project/overview while it upgrades them to scoped URLs.
    if (isProjectTab(tab)) {
        return undefined;
    }
    if (tab !== undefined && tab.includes("/")) {
        const trailing = trailingProjectTab(tab);
        if (trailing !== undefined) {
            // A path-shaped link is the normal result of pasting a section URL: the section exists and
            // the scoped URL is merely an implementation detail. Redirect silently instead of showing a
            // blue banner that talks about Studio's own routing.
            return {destination: trailing};
        }
    }
    switch (tab) {
        case "game-model":
            return {destination: "gameModel", message: "Game design is open. This older bookmark now points to the same saved section."};
        case "build":
        case "buildExport":
        case "build-export":
            return {destination: "exportDeploy", message: "Build/Export is open. This older bookmark now points to the same saved section."};
        case "deployment":
            return {destination: "exportDeploy", message: "Deployment has moved into Build/Export. Choose Remote delivery there to preview or publish to a configured target."};
        case "stakeEngineExport":
            return {destination: "exportDeploy", message: "Stake Engine Export has moved into Build/Export. Choose the Stake Engine export target there."};
        case "outcomeLibraries":
            return {
                destination: "overview",
                message:
                    "Outcome Libraries is no longer available in Studio. Its retired select-existing, inspect, and compare workflow has no Build/Export equivalent; use Overview to inspect the opened outcome source, or use the CLI outcome-source commands for comparison.",
            };
        case "validate":
        case "validation":
            return {destination: "overview", message: "Validate is now part of Overview diagnostics. Revalidate there after changing the project."};
        default:
            return tab === undefined
                ? undefined
                : {
                    destination: "overview",
                    message: "The requested Studio section is no longer available. Overview is open so you can choose a supported workflow for this project.",
                };
    }
}

export function migrationSearch(tab: string | undefined): string {
    return legacyProjectRouteMigration(tab) === undefined ? "" : `?migrated=${encodeURIComponent(tab ?? "")}`;
}
