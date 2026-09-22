import {useEffect, useRef, useState} from "react";
import {getProjectContext, ProjectOpenError} from "../api/apiClient";
import {useStudioApi} from "../context/StudioApiProvider";
import {errorMessage} from "../domain/errorMessage";
import {describeProjectContextFailure, describeProjectHeader, type ProjectHeaderView} from "../domain/interpret/ProjectDashboard";
import {useConfirmedProjectOpen} from "./useOpenProject";

// Ports pollProjectDashboard (500ms interval, capped at 40 attempts, ~20s) -- only ever needed when
// Studio starts directly into Project mode (`pokie .`), since Create/Open both resolve straight to
// loaded/error. The old app's own "stop polling once the user navigates away" route-check is replaced
// here by the effect's cleanup function: ProjectDashboardPage only exists while mounted on "/project",
// so unmounting (navigating to Home) naturally cancels the poll -- no route-comparison needed.
const POLL_INTERVAL_MS = 500;
const POLL_MAX_ATTEMPTS = 40;

function projectContextErrorDetail(error: unknown): string {
    const message = errorMessage(error);
    return error instanceof ProjectOpenError && error.detail !== undefined ? `${message}\n\n${error.detail}` : message;
}

// `requestedProjectRoot` is taken from a project-scoped history route. It must be made current on
// the server before any dashboard data is read: the server intentionally owns one active project,
// while browser history may point back to an earlier one.
export function useProjectContext(requestedProjectRoot?: string, refreshGeneration = 0): ProjectHeaderView {
    const fetchImpl = useStudioApi();
    const openWithConfirmation = useConfirmedProjectOpen();
    const [header, setHeader] = useState<ProjectHeaderView>({status: "empty"});
    const headerRef = useRef(header);

    useEffect(() => {
        headerRef.current = header;
    }, [header]);

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
                        setHeader(describeProjectContextFailure("", errorMessage(error)));
                    }
                });
        };

        if (requestedProjectRoot === undefined) {
            poll(POLL_MAX_ATTEMPTS);
        } else {
            const retainedHeader = headerRef.current;
            const revalidatingCurrentProject =
                (retainedHeader.status === "loaded" || retainedHeader.status === "outcome-source" || retainedHeader.status === "artifact") &&
                retainedHeader.projectRoot === requestedProjectRoot;
            // Do not leave a previous project's dashboard visible while restoring a historical route.
            // A same-project capability refresh is different: preserve the rendered terminal receipt
            // and its dependent form while the fresh context arrives. Clearing the header here used
            // to unmount Replay after an earlier durable receipt, leaving its public Load action with
            // no corresponding Run control even though the server had accepted the request.
            if (!revalidatingCurrentProject) {
                setHeader({status: "loading", projectRoot: requestedProjectRoot});
            }
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
                    openWithConfirmation(requestedProjectRoot)
                        .then(() => {
                            if (!cancelled) {
                                poll(POLL_MAX_ATTEMPTS);
                            }
                        })
                        .catch((error: unknown) => {
                            if (!cancelled) {
                                setHeader(describeProjectContextFailure(requestedProjectRoot, projectContextErrorDetail(error)));
                            }
                        });
                })
                .catch((error: unknown) => {
                    if (!cancelled) {
                        setHeader(describeProjectContextFailure(requestedProjectRoot, errorMessage(error)));
                    }
                });
        }

        return () => {
            cancelled = true;
            clearTimeout(timeoutId);
        };
    }, [fetchImpl, openWithConfirmation, refreshGeneration, requestedProjectRoot]);

    return header;
}
