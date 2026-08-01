// Same role as domain/pathActionError.ts's describePathActionError, for the Runtime tab's own failure
// surfaces (server start/restart/refresh, session create/load, spin, and recent-spins list fetches) --
// none of which are a user-typed path, so that classifier's absent/permission/type reasons don't apply.
// These are always either a raw fetch/network exception (errorMessage(error), e.g. "Failed to fetch")
// or a server-side message string-concatenated into the response body (readRuntimeSessionResult's own
// `{status: "error", message: body.error}`, or StudioRuntimeManager.fail()'s own caught-exception text
// for a runtime that failed to start). Classified into a stable reason so a caller's remediation copy
// stays consistent across every Runtime call site instead of echoing the raw text back.
export type RuntimeActionErrorReason = "network" | "port-in-use" | "schema" | "stale-library" | "other";

export function classifyRuntimeActionErrorReason(message: string): RuntimeActionErrorReason {
    if ((/failed to fetch|networkerror|econnrefused|enotfound/i).test(message)) {
        return "network";
    }
    if ((/eaddrinuse|address already in use/i).test(message)) {
        return "port-in-use";
    }
    if ((/is required\.|must be a non-empty string|is not valid json|unexpected token .*json/i).test(message)) {
        return "schema";
    }
    if ((/changed since you selected it/i).test(message)) {
        return "stale-library";
    }
    return "other";
}

type RuntimeActionIssue = {status: string; remediation: string};

const RUNTIME_ACTION_ISSUE_COPY: Record<RuntimeActionErrorReason, (subject: string) => RuntimeActionIssue> = {
    network: (subject) => ({status: `${subject} couldn't reach the Studio server.`, remediation: "Check your connection and try again."}),
    "port-in-use": (subject) => ({
        status: `${subject} couldn't start -- the configured host/port is already in use.`,
        remediation: "Choose a different port, or stop whatever else is using it, then try again.",
    }),
    schema: (subject) => ({status: `${subject} was rejected as invalid.`, remediation: "Check the values entered and try again."}),
    "stale-library": (subject) => ({
        status: `${subject} refused to start against a pre-generated outcome library that changed since you selected it in Outcome Libraries.`,
        remediation: "Re-select it in Outcome Libraries and try again.",
    }),
    other: (subject) => ({
        status: `${subject} couldn't be completed.`,
        remediation: "Try again, and check the Studio server logs if the problem persists.",
    }),
};

// Turns a Runtime call site's raw backend failure text into inline, subject-specific status + remediation
// copy -- e.g. describeRuntimeActionError("The runtime server", "EADDRINUSE: address already in use ...")
// -> "The runtime server couldn't start -- the configured host/port is already in use. Choose a different
// port, or stop whatever else is using it, then try again." Never echoes the raw message back, same
// convention as describePathActionError -- a network hiccup or a game's own startup failure is an
// everyday outcome of driving a real local server, not a bug worth surfacing verbatim.
export function describeRuntimeActionError(subject: string, message: string): string {
    const {status, remediation} = RUNTIME_ACTION_ISSUE_COPY[classifyRuntimeActionErrorReason(message)](subject);
    return `${status} ${remediation}`;
}
