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
export type ProjectContextRefresh = {
    header: ProjectHeaderView;
    /** The latest caller-owned refresh generation whose context is rendered. */
    completedRefreshGeneration: number;
    /** The latest caller-owned refresh generation that rendered a diagnostic. */
    failedRefreshGeneration: number;
};

export function useProjectContext(requestedProjectRoot?: string, refreshGeneration = 0): ProjectContextRefresh {
    const fetchImpl = useStudioApi();
    const openWithConfirmation = useConfirmedProjectOpen();
    const [header, setHeader] = useState<ProjectHeaderView>({status: "empty"});
    const [completedRefreshGeneration, setCompletedRefreshGeneration] = useState(0);
    const [failedRefreshGeneration, setFailedRefreshGeneration] = useState(0);
    const [renderedTerminal, setRenderedTerminal] = useState<{generation: number; header: ProjectHeaderView; outcome: "completed" | "failed"} | undefined>(undefined);
    const headerRef = useRef(header);
    const contextRequestRef = useRef<{key: string; promise: ReturnType<typeof getProjectContext>} | undefined>(undefined);

    useEffect(() => {
        headerRef.current = header;
    }, [header]);

    // Acknowledgement is deliberately post-commit and identity-bound. A
    // consumer can use this generation to change routes, so setting it from
    // the fetch callback would let that consumer observe an earlier terminal
    // header while the exact fresh generation is still loading.
    useEffect(() => {
        if (renderedTerminal === undefined || header !== renderedTerminal.header || header.status === "loading") {
            return;
        }
        if (renderedTerminal.outcome === "completed") {
            setCompletedRefreshGeneration(renderedTerminal.generation);
        } else {
            setFailedRefreshGeneration(renderedTerminal.generation);
        }
    }, [header, renderedTerminal]);

    useEffect(() => {
        let cancelled = false;
        let timeoutId: ReturnType<typeof setTimeout> | undefined;

        // React's development effect replay must not create a second context
        // request for the same refresh generation.  Apart from making the
        // network receipt ambiguous, a second request can complete while the
        // first is still loading and release a dependent tab too early.  The
        // replay subscriber still consumes the shared promise, so cancelling
        // the first effect never strands the current rendered dashboard.
        const contextRequestKey = `${requestedProjectRoot ?? ""}\u0000${refreshGeneration}`;
        const requestDashboard = (): ReturnType<typeof getProjectContext> => {
            if (contextRequestRef.current?.key === contextRequestKey) {
                return contextRequestRef.current.promise;
            }
            const promise = getProjectContext(fetchImpl);
            contextRequestRef.current = {key: contextRequestKey, promise};
            promise.finally(() => {
                if (contextRequestRef.current?.promise === promise) {
                    contextRequestRef.current = undefined;
                }
            }).catch(() => undefined);
            return promise;
        };

        const publishDashboard = (dashboard: Parameters<typeof describeProjectHeader>[0]): void => {
            const nextHeader = describeProjectHeader(dashboard);
            setHeader(nextHeader);
            // Consumers that need a capability refresh before selecting a
            // dependent workflow wait for this acknowledgement, rather than
            // treating the request start or an older page header as proof.
            // A loading context is a polling placeholder, not a rendered
            // capability boundary.  Dashboard navigation must wait until the
            // refresh has reached a terminal context.
            if (dashboard.status !== "loading") {
                setRenderedTerminal({generation: refreshGeneration, header: nextHeader, outcome: nextHeader.status === "error" ? "failed" : "completed"});
            }
        };

        const publishFailure = (projectRoot: string, error: unknown): void => {
            const nextHeader = describeProjectContextFailure(projectRoot, errorMessage(error));
            setHeader(nextHeader);
            setRenderedTerminal({generation: refreshGeneration, header: nextHeader, outcome: "failed"});
        };

        const poll = (attemptsLeft: number): void => {
            requestDashboard()
                .then((dashboard) => {
                    if (cancelled) {
                        return;
                    }
                    publishDashboard(dashboard);
                    if (dashboard.status === "loading" && attemptsLeft > 0) {
                        timeoutId = setTimeout(() => poll(attemptsLeft - 1), POLL_INTERVAL_MS);
                    }
                })
                .catch((error: unknown) => {
                    if (!cancelled) {
                        publishFailure("", error);
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
            requestDashboard()
                .then((dashboard) => {
                    if (cancelled) {
                        return;
                    }
                    // The usual Home -> Project flow has already opened this exact root before
                    // navigating. Reuse that freshly loaded context; only a historical route whose
                    // root differs from the server's current one needs another open request.
                    if (dashboard.status !== "empty" && dashboard.projectRoot === requestedProjectRoot) {
                        publishDashboard(dashboard);
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
                                const nextHeader = describeProjectContextFailure(requestedProjectRoot, projectContextErrorDetail(error));
                                setHeader(nextHeader);
                                setRenderedTerminal({generation: refreshGeneration, header: nextHeader, outcome: "failed"});
                            }
                        });
                })
                .catch((error: unknown) => {
                    if (!cancelled) {
                        publishFailure(requestedProjectRoot, error);
                    }
                });
        }

        return () => {
            cancelled = true;
            clearTimeout(timeoutId);
        };
    }, [fetchImpl, openWithConfirmation, refreshGeneration, requestedProjectRoot]);

    return {header, completedRefreshGeneration, failedRefreshGeneration};
}
