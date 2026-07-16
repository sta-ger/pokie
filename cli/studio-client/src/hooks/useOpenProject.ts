import {useCallback} from "react";
import {useNavigate} from "react-router-dom";
import {openProject} from "../api/apiClient";
import {useStudioApi} from "../context/StudioApiProvider";

// Shared by the Recent Projects list, the Open Existing Project form, and every flow's own "Open in
// Studio" button (Create/Init/Build/Blueprint-Build) -- the one explicit Home -> Project transition, see
// apiClient.openProject's own doc comment. Throws on failure so each caller decides how to surface the
// error in its own tab's error element, same contract as the old openAndNavigate in main.ts.
// ProjectDashboardPage loads/polls its own dashboard context on mount, so this only needs to open the
// project on the server and switch routes.
//
// Deliberately knows nothing about a dirty Design & Build draft -- that's guarded once, centrally, at the
// router level (useDesignNavigationGuard's useBlocker), not here. A `navigate("/project")` call this
// function makes is just one more history transition the blocker sees and can intercept the same way it
// intercepts a browser Back press or a direct hash edit; duplicating that check here would risk a double
// confirmation.
export function useOpenProject(): (projectRoot: string) => Promise<void> {
    const fetchImpl = useStudioApi();
    const navigate = useNavigate();
    return useCallback(
        async (projectRoot: string) => {
            await openProject(fetchImpl, projectRoot);
            navigate("/project");
        },
        [fetchImpl, navigate],
    );
}
