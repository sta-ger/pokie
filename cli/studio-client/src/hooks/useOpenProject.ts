import {useCallback} from "react";
import {useNavigate} from "react-router-dom";
import {openProject} from "../api/apiClient";
import {useStudioApi} from "../context/StudioApiProvider";
import {useDesignDirtyGuard} from "../context/DesignDirtyGuardContext";

// Shared by the Recent Projects list, the Open Existing Project form, and every flow's own "Open in
// Studio" button (Create/Init/Build/Blueprint-Build) -- the one explicit Home -> Project transition, see
// apiClient.openProject's own doc comment. Throws on failure so each caller decides how to surface the
// error in its own tab's error element, same contract as the old openAndNavigate in main.ts.
// ProjectDashboardPage loads/polls its own dashboard context on mount, so this only needs to open the
// project on the server and switch routes.
//
// Consults DesignDirtyGuardContext (present only inside HomePage, absent everywhere else) before
// navigating -- if Design & Build has unsaved edits, the user is asked to confirm losing them first. A
// decline resolves (doesn't reject) without navigating, so a caller's own loading state still clears
// normally instead of hanging.
export function useOpenProject(): (projectRoot: string) => Promise<void> {
    const fetchImpl = useStudioApi();
    const navigate = useNavigate();
    const guardNavigation = useDesignDirtyGuard();
    return useCallback(
        (projectRoot: string) =>
            new Promise<void>((resolve, reject) => {
                const proceed = (): void => {
                    openProject(fetchImpl, projectRoot)
                        .then(() => {
                            navigate("/project");
                            resolve();
                        })
                        .catch(reject);
                };
                if (guardNavigation) {
                    guardNavigation(proceed, resolve);
                } else {
                    proceed();
                }
            }),
        [fetchImpl, navigate, guardNavigation],
    );
}
