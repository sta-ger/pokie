import {useEffect, useState} from "react";
import {getProjectContext} from "../api/apiClient";
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

export function useProjectContext(): ProjectHeaderView {
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

        poll(POLL_MAX_ATTEMPTS);

        return () => {
            cancelled = true;
            clearTimeout(timeoutId);
        };
    }, [fetchImpl]);

    return header;
}
