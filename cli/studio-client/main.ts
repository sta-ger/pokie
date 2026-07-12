import {
    closeProject,
    createProject,
    FetchLike,
    getContext,
    getProjectContext,
    inspectProject,
    listRecentProjects,
    openProject,
    validateProject,
} from "./apiClient.js";
import {
    Elements,
    ProjectTab,
    queryElements,
    renderProjectHeader,
    renderProvenance,
    renderRecentProjects,
    renderValidationSummary,
    setStatus,
    showProjectTab,
    showView,
} from "./dom.js";
import {describeProjectHeader, describeProvenance, describeValidationSummary} from "./interpretProjectDashboard.js";
import {currentRoute, navigate, onRouteChange, StudioRoute} from "./router.js";
import type {ProjectDashboardContext, StudioContext} from "./types.js";

// How long/often to re-check GET /api/project/context while it reports "loading" — only ever
// happens right after Studio starts directly into Project mode (`pokie .`/`pokie <path>`), since
// Create/Open both resolve straight to "loaded"/an error response. Bounded so a pathologically
// hanging entry-module load doesn't poll forever.
const PROJECT_POLL_INTERVAL_MS = 500;
const PROJECT_POLL_MAX_ATTEMPTS = 40;

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
    let activeProjectTab: ProjectTab = "overview";

    // Inspect is safe to run whenever the dashboard shows "loaded" or "error" — it only ever reads
    // package.json/build-info.json, independent of whether the entry module itself loaded — so it's
    // both the automatic provenance fetch on dashboard load and the manual "Inspect" quick action.
    const refreshInspect = (): void => {
        inspectProject(fetchImpl)
            .then((report) => {
                setStatus(elements.inspectStatus, "");
                renderProvenance(elements, describeProvenance(report));
            })
            .catch((error: unknown) => {
                setStatus(elements.inspectStatus, error instanceof Error ? error.message : String(error));
            });
    };

    const runValidate = (): void => {
        setStatus(elements.validationStatus, "Validating…");
        validateProject(fetchImpl)
            .then((report) => {
                setStatus(elements.validationStatus, "");
                renderValidationSummary(elements, describeValidationSummary(report));
            })
            .catch((error: unknown) => {
                setStatus(elements.validationStatus, error instanceof Error ? error.message : String(error));
            });
    };

    const showProjectDashboard = (dashboard: ProjectDashboardContext): void => {
        renderProjectHeader(elements, describeProjectHeader(dashboard), activeProjectTab);
        if (dashboard.status === "loaded" || dashboard.status === "error") {
            refreshInspect();
        }
    };

    const pollProjectDashboard = (attemptsLeft: number): void => {
        getProjectContext(fetchImpl)
            .then((dashboard) => {
                showProjectDashboard(dashboard);
                if (dashboard.status === "loading" && attemptsLeft > 0 && currentRoute() === "project") {
                    setTimeout(() => pollProjectDashboard(attemptsLeft - 1), PROJECT_POLL_INTERVAL_MS);
                }
            })
            .catch((error: unknown) => {
                setStatus(elements.status, error instanceof Error ? error.message : String(error));
            });
    };

    // Shared by both the Open Project form and clicking a Recent Projects entry — opens
    // `projectRoot` through the API and, on success, switches the app to the Project route. Throws
    // on failure so each caller decides how to surface the error (the form clears/sets its own
    // status text; a recent-projects click reuses the same status element).
    const openAndNavigate = async (projectRoot: string): Promise<void> => {
        const {context} = await openProject(fetchImpl, projectRoot);
        navigate("project");
        showView(elements, "project");
        if (context.mode === "project") {
            pollProjectDashboard(PROJECT_POLL_MAX_ATTEMPTS);
        }
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
        navigate(routeForContext(context));
        showView(elements, currentRoute());
        if (currentRoute() === "home") {
            refreshHome();
        } else {
            pollProjectDashboard(PROJECT_POLL_MAX_ATTEMPTS);
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
        } else {
            pollProjectDashboard(PROJECT_POLL_MAX_ATTEMPTS);
        }
    });

    elements.createForm.addEventListener("submit", (event) => {
        event.preventDefault();
        setStatus(elements.createStatus, "Creating…");
        createProject(fetchImpl, elements.createName.value)
            .then(({context}) => {
                setStatus(elements.createStatus, "");
                navigate("project");
                showView(elements, "project");
                if (context.mode === "project") {
                    pollProjectDashboard(PROJECT_POLL_MAX_ATTEMPTS);
                }
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

    elements.tabOverviewButton.addEventListener("click", () => {
        activeProjectTab = "overview";
        showProjectTab(elements, "overview");
    });

    elements.tabValidationButton.addEventListener("click", () => {
        activeProjectTab = "validation";
        showProjectTab(elements, "validation");
    });

    elements.inspectButton.addEventListener("click", () => {
        setStatus(elements.inspectStatus, "Inspecting…");
        refreshInspect();
    });

    elements.validateQuickActionButton.addEventListener("click", () => {
        activeProjectTab = "validation";
        showProjectTab(elements, "validation");
        runValidate();
    });

    elements.runValidateButton.addEventListener("click", () => {
        runValidate();
    });
}

main().catch((error: unknown) => {
    console.error(error);
});
