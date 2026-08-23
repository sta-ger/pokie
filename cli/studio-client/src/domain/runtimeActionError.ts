// Same role as domain/pathActionError.ts's describePathActionError, for the Play tab's own failure
// surfaces (session create/reset, spin, find-any-win/find-symbol-win) -- none of which are a user-typed
// path, so that classifier's absent/permission/type reasons don't apply. These are always either a raw
// fetch/network exception (errorMessage(error), e.g. "Failed to fetch") or a server-side message
// string-concatenated into the response body (StudioPlayService's own caught-exception text).
// Classified into a stable reason so a caller's remediation copy stays consistent across call sites
// instead of echoing the raw text back.
export type RuntimeActionErrorReason = "network" | "schema" | "unsupported" | "scenario-not-found" | "other";

export function classifyRuntimeActionErrorReason(message: string): RuntimeActionErrorReason {
    if ((/failed to fetch|networkerror|econnrefused|enotfound/i).test(message)) {
        return "network";
    }
    if ((/is required\.|must be a non-empty string|is not valid json|unexpected token .*json/i).test(message)) {
        return "schema";
    }
    // These are StudioPlayService's own stable, safe capability diagnostics.  They are an expected
    // product outcome for a scenario a Game Model has not configured, not a transient failure that a
    // retry can repair.  Keep the UI copy semantic rather than echoing the server message verbatim.
    if ((/doesn't support .*|doesn't report .*|isn't available for it\./i).test(message)) {
        return "unsupported";
    }
    // Scenario searches are deliberately bounded server-side.  An exhausted search likewise needs a
    // modelling remedy, rather than the generic retry advice used for an unexpected runtime failure.
    if ((/no matching round was found within \d+ spins\./i).test(message)) {
        return "scenario-not-found";
    }
    return "other";
}

type RuntimeActionIssue = {status: string; remediation: string};

const RUNTIME_ACTION_ISSUE_COPY: Record<RuntimeActionErrorReason, (subject: string) => RuntimeActionIssue> = {
    network: (subject) => ({status: `${subject} couldn't reach the Studio server.`, remediation: "Check your connection and try again."}),
    schema: (subject) => ({status: `${subject} was rejected as invalid.`, remediation: "Check the values entered and try again."}),
    unsupported: (subject) => ({
        status: `${subject} isn't available for this game.`,
        remediation: "Configure the required game feature, then start a new session.",
    }),
    "scenario-not-found": (subject) => ({
        status: `${subject} didn't find a matching round.`,
        remediation: "Check the game feature configuration, then start a new session.",
    }),
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
