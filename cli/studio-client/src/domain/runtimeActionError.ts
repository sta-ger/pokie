// Same role as domain/pathActionError.ts's describePathActionError, for the Play tab's own failure
// surfaces (session create/reset, spin, find-any-win/find-symbol-win) -- none of which are a user-typed
// path, so that classifier's absent/permission/type reasons don't apply. These are always either a raw
// fetch/network exception (errorMessage(error), e.g. "Failed to fetch") or a server-side message
// string-concatenated into the response body (StudioPlayService's own caught-exception text).
// Classified into a stable reason so a caller's remediation copy stays consistent across call sites
// instead of echoing the raw text back.
export type RuntimeActionErrorReason = "network" | "schema" | "other";

export function classifyRuntimeActionErrorReason(message: string): RuntimeActionErrorReason {
    if ((/failed to fetch|networkerror|econnrefused|enotfound/i).test(message)) {
        return "network";
    }
    if ((/is required\.|must be a non-empty string|is not valid json|unexpected token .*json/i).test(message)) {
        return "schema";
    }
    return "other";
}

type RuntimeActionIssue = {status: string; remediation: string};

const RUNTIME_ACTION_ISSUE_COPY: Record<RuntimeActionErrorReason, (subject: string) => RuntimeActionIssue> = {
    network: (subject) => ({status: `${subject} couldn't reach the Studio server.`, remediation: "Check your connection and try again."}),
    schema: (subject) => ({status: `${subject} was rejected as invalid.`, remediation: "Check the values entered and try again."}),
    other: (subject) => ({
        status: `${subject} couldn't be completed.`,
        remediation: "Try again. If it continues, start a new session and retry.",
    }),
};

// Turns a Play call site's raw backend failure text into inline, subject-specific status + remediation
// copy -- e.g. describeRuntimeActionError("This session", "Insufficient balance for this session.")
// -> "This session couldn't be completed. Try again. If it continues, start a new session and retry."
// persists." Never echoes the raw message back, same convention as describePathActionError -- a network
// hiccup or a game's own failure is an everyday outcome, not a bug worth surfacing verbatim.
export function describeRuntimeActionError(subject: string, message: string): string {
    const {status, remediation} = RUNTIME_ACTION_ISSUE_COPY[classifyRuntimeActionErrorReason(message)](subject);
    return `${status} ${remediation}`;
}
