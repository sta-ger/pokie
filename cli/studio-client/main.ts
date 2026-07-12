import {closeProject, createProject, FetchLike, getContext, listRecentProjects, openProject} from "./apiClient.js";
import {Elements, queryElements, renderProjectRoot, renderRecentProjects, setStatus, showView} from "./dom.js";
import {currentRoute, navigate, onRouteChange, StudioRoute} from "./router.js";
import type {StudioContext} from "./types.js";

function routeForContext(context: StudioContext): StudioRoute {
    return context.mode === "project" ? "project" : "home";
}

async function refreshRecentProjects(elements: Elements, fetchImpl: FetchLike, onOpen: (projectRoot: string) => void): Promise<void> {
    const entries = await listRecentProjects(fetchImpl);
    renderRecentProjects(elements.recentList, entries, onOpen);
}

async function main(): Promise<void> {
    const elements = queryElements();
    const fetchImpl = window.fetch.bind(window) as FetchLike;

    // Shared by both the Open Project form and clicking a Recent Projects entry — opens
    // `projectRoot` through the API and, on success, switches the app to the Project route. Throws
    // on failure so each caller decides how to surface the error (the form clears/sets its own
    // status text; a recent-projects click reuses the same status element).
    const openAndNavigate = async (projectRoot: string): Promise<void> => {
        const {context} = await openProject(fetchImpl, projectRoot);
        if (context.mode === "project") {
            renderProjectRoot(elements, context.projectRoot);
        }
        navigate("project");
        showView(elements, "project");
    };

    const refreshHome = (): void => {
        refreshRecentProjects(elements, fetchImpl, (projectRoot) => {
            openAndNavigate(projectRoot).catch((error: unknown) => {
                setStatus(elements.openStatus, error instanceof Error ? error.message : String(error));
            });
        }).catch((error: unknown) => {
            setStatus(elements.status, error instanceof Error ? error.message : String(error));
        });
    };

    try {
        setStatus(elements.status, "Connecting…");
        const context = await getContext(fetchImpl);
        if (context.mode === "project") {
            renderProjectRoot(elements, context.projectRoot);
        }
        navigate(routeForContext(context));
        showView(elements, currentRoute());
        if (currentRoute() === "home") {
            refreshHome();
        }
        setStatus(elements.status, "Ready");
    } catch (error) {
        setStatus(elements.status, error instanceof Error ? error.message : String(error));
        return;
    }

    onRouteChange((route) => {
        showView(elements, route);
        if (route === "home") {
            refreshHome();
        }
    });

    elements.createForm.addEventListener("submit", (event) => {
        event.preventDefault();
        setStatus(elements.createStatus, "Creating…");
        createProject(fetchImpl, elements.createName.value)
            .then(({context}) => {
                if (context.mode === "project") {
                    renderProjectRoot(elements, context.projectRoot);
                }
                setStatus(elements.createStatus, "");
                navigate("project");
                showView(elements, "project");
            })
            .catch((error: unknown) => {
                setStatus(elements.createStatus, error instanceof Error ? error.message : String(error));
            });
    });

    elements.openForm.addEventListener("submit", (event) => {
        event.preventDefault();
        setStatus(elements.openStatus, "Opening…");
        openAndNavigate(elements.openPath.value)
            .then(() => setStatus(elements.openStatus, ""))
            .catch((error: unknown) => {
                setStatus(elements.openStatus, error instanceof Error ? error.message : String(error));
            });
    });

    elements.closeProjectButton.addEventListener("click", () => {
        closeProject(fetchImpl)
            .then(() => {
                navigate("home");
                showView(elements, "home");
                refreshHome();
            })
            .catch((error: unknown) => {
                setStatus(elements.status, error instanceof Error ? error.message : String(error));
            });
    });
}

main().catch((error: unknown) => {
    console.error(error);
});
