// Same role as domain/pathActionError.ts's describePathActionError, domain/replayActionError.ts's
// describeReplayActionError, and domain/runtimeActionError.ts's describeRuntimeActionError, for the
// page-owned failure surfaces that don't belong to any one of those three tabs: Simulation & Reports'
// own run/poll/report-fetch/recent-runs failures, Overview's inspection fetch, Validation's own
// validate-project request, and the deployment-targets list both Export & Deploy and Deployment render
// (see ProjectDashboardPage.tsx's refreshInspect/runValidate/refreshReports/selectReport/onCompare and
// useDeploymentManager.ts's refreshTargets). These are always either a raw fetch/network exception
// (errorMessage(error), e.g. "Failed to fetch") or a hand-written request-validation rejection from the
// server -- never a user-typed path, so classifyPathActionErrorReason's absent/permission/type reasons
// don't apply, and never Runtime's own port-in-use case.
export type ProjectActionErrorReason = "network" | "schema" | "other";

export function classifyProjectActionErrorReason(message: string): ProjectActionErrorReason {
    if ((/failed to fetch|networkerror|econnrefused|enotfound/i).test(message)) {
        return "network";
    }
    if ((/is required\.|must be a non-empty string|must be a positive integer|is not valid json|unexpected token .*json/i).test(message)) {
        return "schema";
    }
    return "other";
}

type ProjectActionIssue = {status: string; remediation: string};

const PROJECT_ACTION_ISSUE_COPY: Record<ProjectActionErrorReason, (subject: string) => ProjectActionIssue> = {
    network: (subject) => ({status: `${subject} couldn't reach the Studio server.`, remediation: "Check your connection and try again."}),
    schema: (subject) => ({status: `${subject} was rejected as invalid.`, remediation: "Check the values entered and try again."}),
    other: (subject) => ({
        status: `${subject} couldn't be completed.`,
        remediation: "Try again, and check the Studio server logs if the problem persists.",
    }),
};

// Turns a Simulation/Overview/Validation/deployment-targets call site's raw backend failure text into
// inline, subject-specific status + remediation copy -- e.g. describeProjectActionError("The recent runs
// list", "Failed to fetch") -> "The recent runs list couldn't reach the Studio server. Check your
// connection and try again." Never echoes the raw message back, same convention every other
// describe*ActionError helper in this directory follows -- a network hiccup or a rejected request is an
// everyday outcome of driving a real local server, not a bug worth surfacing verbatim.
export function describeProjectActionError(subject: string, message: string): string {
    const {status, remediation} = PROJECT_ACTION_ISSUE_COPY[classifyProjectActionErrorReason(message)](subject);
    return `${status} ${remediation}`;
}
