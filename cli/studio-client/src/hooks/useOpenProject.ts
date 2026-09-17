import {useCallback} from "react";
import {useNavigate} from "react-router-dom";
import {openProject, ProjectTransitionConflict} from "../api/apiClient";
import {useStudioApi} from "../context/StudioApiProvider";
import {useGuardedAction} from "../context/DesignNavigationGuardContext";
import {useConfirm} from "./useConfirm";

// Shared by the Projects registry list, the Open by path form, and the guided editor's own "Open in
// Studio" button (Blueprint-Build) -- the one explicit Home -> Project transition, see
// apiClient.openProject's own doc comment. Throws on failure so each caller decides how to surface the
// error in its own tab's error element, same contract as the old openAndNavigate in main.ts.
// ProjectDashboardPage loads/polls its own dashboard context on mount, so this only needs to open the
// project on the server and switch routes.
//
// Routed through the one shared `guardedAction` (see useDesignNavigationGuard/DesignNavigationGuardContext)
// instead of calling openProject/navigate directly: while a Design Game draft is dirty, this defers
// *both* the API call and the navigation until the user confirms -- Cancel must never have already told
// the server to open a different project. guardedAction also suppresses the router-level blocker for the
// one navigate() call this makes once confirmed, so there's exactly one confirmation, never two.
export function useOpenProject(): (projectRoot: string) => Promise<void> {
    const fetchImpl = useStudioApi();
    const navigate = useNavigate();
    const guardedAction = useGuardedAction();
    const confirm = useConfirm();
    return useCallback(
        (projectRoot: string) =>
            guardedAction(async () => {
                let opened;
                try {
                    opened = await openProject(fetchImpl, projectRoot);
                } catch (error) {
                    if (!(error instanceof ProjectTransitionConflict)) throw error;
                    opened = await new Promise<Awaited<ReturnType<typeof openProject>>>((resolve, reject) => {
                        const operations = error.operations.join(", ") || "active Studio operations";
                        confirm(`Active operations: ${operations}. Open another project and cancel them after cleanup?`, () => {
                            openProject(fetchImpl, projectRoot, true).then(resolve, reject);
                        }, () => reject(new Error("Project switch cancelled.")));
                    });
                }
                const {context} = opened;
                // Project identity belongs in the history entry, not only in the server's mutable
                // current-project context. This lets a Back/Forward navigation restore the project
                // whose state the entry represents before its dashboard can become interactive. The
                // server resolves the selected registry entry (a Blueprint can resolve to its generated
                // runtime package), so its returned context is the authoritative route identity.
                navigate(`/project/${encodeURIComponent(context.projectRoot)}/overview`);
            }),
        [fetchImpl, navigate, guardedAction, confirm],
    );
}
