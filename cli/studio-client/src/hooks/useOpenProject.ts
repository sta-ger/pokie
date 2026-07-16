import {useCallback} from "react";
import {useNavigate} from "react-router-dom";
import {openProject} from "../api/apiClient";
import {useStudioApi} from "../context/StudioApiProvider";
import {useGuardedAction} from "../context/DesignNavigationGuardContext";

// Shared by the Recent Projects list, the Open Existing Project form, and every flow's own "Open in
// Studio" button (Create/Init/Build/Blueprint-Build) -- the one explicit Home -> Project transition, see
// apiClient.openProject's own doc comment. Throws on failure so each caller decides how to surface the
// error in its own tab's error element, same contract as the old openAndNavigate in main.ts.
// ProjectDashboardPage loads/polls its own dashboard context on mount, so this only needs to open the
// project on the server and switch routes.
//
// Routed through the one shared `guardedAction` (see useDesignNavigationGuard/DesignNavigationGuardContext)
// instead of calling openProject/navigate directly: while a Design & Build draft is dirty, this defers
// *both* the API call and the navigation until the user confirms -- Cancel must never have already told
// the server to open a different project. guardedAction also suppresses the router-level blocker for the
// one navigate() call this makes once confirmed, so there's exactly one confirmation, never two.
export function useOpenProject(): (projectRoot: string) => Promise<void> {
    const fetchImpl = useStudioApi();
    const navigate = useNavigate();
    const guardedAction = useGuardedAction();
    return useCallback(
        (projectRoot: string) =>
            guardedAction(async () => {
                await openProject(fetchImpl, projectRoot);
                navigate("/project");
            }),
        [fetchImpl, navigate, guardedAction],
    );
}
