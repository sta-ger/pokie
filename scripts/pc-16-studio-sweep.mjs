/**
 * The bounded regression closure for PC-16.
 *
 * This intentionally describes the automated checks, rather than pretending
 * that a jsdom suite is browser evidence.  The controller-owned Chromium run
 * uses the same two named workflow groups with a fresh profile.
 */
export const PC16_WORKFLOW_GROUPS = [
    {
        id: "project-context-lifecycle",
        owner: "ProjectDashboardPage/useProjectContext",
        coverage: ["project-switch", "history-restore", "retired-route-recovery", "stale-result-reset"],
        testPath: "tests/cli/studio-client/src/PC16StudioContextLifecycle.browser.test.tsx",
    },
    {
        id: "generated-artifact-product-sweep",
        owner: "StudioServer and retained project tabs",
        coverage: ["generated-artifact-open", "play-output", "simulation-output", "replay-output", "artifact-publication"],
        testPath: "tests/cli/studio-client/src/PC16StudioProductSweep.browser.test.tsx",
    },
];

export function validatePc16WorkflowGroups(groups = PC16_WORKFLOW_GROUPS) {
    const coverage = new Set();
    const ids = new Set();
    for (const group of groups) {
        if (!group.id || ids.has(group.id) || !group.owner || !group.testPath || group.coverage.length === 0) {
            throw new Error("Each PC-16 workflow group needs one identity, owner, test path, and coverage.");
        }
        ids.add(group.id);
        for (const item of group.coverage) {
            if (coverage.has(item)) {
                throw new Error(`PC-16 workflow coverage is duplicated: ${item}.`);
            }
            coverage.add(item);
        }
    }
}
