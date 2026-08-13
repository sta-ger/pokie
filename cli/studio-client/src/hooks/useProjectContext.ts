import {useEffect, useState} from "react";
import {getProjectContext, openProject} from "../api/apiClient";
import {useStudioApi} from "../context/StudioApiProvider";
import {errorMessage} from "../domain/errorMessage";
import {describeProjectHeader, type ProjectHeaderView} from "../domain/interpret/ProjectDashboard";

// Ports pollProjectDashboard (500ms interval, capped at 40 attempts, ~20s) -- only ever needed when
// Studio starts directly into Project mode (`pokie .`), since Create/Open both resolve straight to
// loaded/error. The old app's own "stop polling once the user navigates away" route-check is replaced
// here by the effect's cleanup function: ProjectDashboardPage only exists while mounted on "/project",
// so unmounting (navigating to Home) naturally cancels the poll -- no route-comparison needed.
const POLL_INTERVAL_MS = 500;
const POLL_MAX_ATTEMPTS = 40;

// `requestedProjectRoot` is taken from a project-scoped history route. It must be made current on
// the server before any dashboard data is read: the server intentionally owns one active project,
// while browser history may point back to an earlier one.
export function useProjectContext(requestedProjectRoot?: string): ProjectHeaderView {
    const fetchImpl = useStudioApi();
    const [header, setHeader] = useState<ProjectHeaderView>({status: "empty"});

    useEffect(() => {
        let cancelled = false;
        let timeoutId: ReturnType<typeof setTimeout> | undefined;

        const poll = (attemptsLeft: number): void => {
            getProjectContext(fetchImpl)
                .then((dashboard) => {
                    if (cancelled) {
                        return;
                    }
                    setHeader(describeProjectHeader(dashboard));
                    if (dashboard.status === "loading" && attemptsLeft > 0) {
                        timeoutId = setTimeout(() => poll(attemptsLeft - 1), POLL_INTERVAL_MS);
                    }
                })
                .catch((error: unknown) => {
                    if (!cancelled) {
                        setHeader({status: "error", projectRoot: "", message: errorMessage(error)});
                    }
                });
        };

        if (requestedProjectRoot === undefined) {
            poll(POLL_MAX_ATTEMPTS);
        } else {
            // Do not leave the previous dashboard visible while restoring a historical route. The
            // caller's keyed route remount already clears local state; this explicit loading header
            // also prevents project-scoped requests until the server has accepted the requested root.
            setHeader({status: "loading", projectRoot: requestedProjectRoot});
            getProjectContext(fetchImpl)
                .then((dashboard) => {
                    if (cancelled) {
                        return;
                    }
                    // The usual Home -> Project flow has already opened this exact root before
                    // navigating. Reuse that freshly loaded context; only a historical route whose
                    // root differs from the server's current one needs another open request.
                    if (dashboard.status !== "empty" && dashboard.projectRoot === requestedProjectRoot) {
                        setHeader(describeProjectHeader(dashboard));
                        if (dashboard.status === "loading") {
                            timeoutId = setTimeout(() => poll(POLL_MAX_ATTEMPTS - 1), POLL_INTERVAL_MS);
                        }
                        return;
                    }
                    openProject(fetchImpl, requestedProjectRoot)
                        .then(() => {
                            if (!cancelled) {
                                poll(POLL_MAX_ATTEMPTS);
                            }
                        })
                        .catch((error: unknown) => {
                            if (!cancelled) {
                                setHeader({status: "error", projectRoot: requestedProjectRoot, message: errorMessage(error)});
                            }
                        });
                })
                .catch((error: unknown) => {
                    if (!cancelled) {
                        setHeader({status: "error", projectRoot: requestedProjectRoot, message: errorMessage(error)});
                    }
                });
        }

        return () => {
            cancelled = true;
            clearTimeout(timeoutId);
        };
    }, [fetchImpl, requestedProjectRoot]);

    return header;
}
