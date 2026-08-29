import {isRuntimePreparationDiagnostic} from "./runtimeActionError";

// Same role as domain/pathActionError.ts's describePathActionError and domain/runtimeActionError.ts's
// describeRuntimeActionError, for the Replay & Debug tab's own failure surfaces (list/refresh, run/cancel,
// and the recent-spins/recent-simulations list fetches feeding its Session Spin/Recent Simulation sources)
// -- none of which are a user-typed path, so that classifier's absent/permission/type reasons don't apply.
// These are always either a raw fetch/network exception (errorMessage(error), e.g. "Failed to fetch"), a
// request-validation rejection (validateReplayRequest.ts's own hand-written round/seed messages, or the
// inspect-artifact endpoint's "Request body must be a JSON object."), or an unknown/expired id (a replay
// job that's aged out of the server's retention, or was deleted between listing and loading it).
export type ReplayActionErrorReason = "network" | "schema" | "not-found" | "other";

export function classifyReplayActionErrorReason(message: string): ReplayActionErrorReason {
    if ((/failed to fetch|networkerror|econnrefused|enotfound/i).test(message)) {
        return "network";
    }
    if (
        (/must be a positive integer|must not exceed|must be a non-empty string|is not valid json|unexpected token .*json|must be a json object/i).test(
            message,
        )
    ) {
        return "schema";
    }
    if ((/unknown replay id|no longer exists|not found/i).test(message)) {
        return "not-found";
    }
    return "other";
}

type ReplayActionIssue = {status: string; remediation: string};

const REPLAY_ACTION_ISSUE_COPY: Record<ReplayActionErrorReason, (subject: string) => ReplayActionIssue> = {
    network: (subject) => ({status: `${subject} couldn't reach the Studio server.`, remediation: "Check your connection and try again."}),
    schema: (subject) => ({status: `${subject} was rejected as invalid.`, remediation: "Check the round/seed/artifact values entered and try again."}),
    "not-found": (subject) => ({
        status: `${subject} could no longer be found.`,
        remediation: "It may have been deleted or aged out of the server's history -- refresh and try again.",
    }),
    other: (subject) => ({
        status: `${subject} couldn't be completed.`,
        remediation: "Try again. If it continues, reload the replay source and retry.",
    }),
};

// Turns a Replay call site's raw backend failure text into inline, subject-specific status + remediation
// copy -- e.g. describeReplayActionError("The replay list", 'Unknown replay id "bad".') -> "The replay list
// could no longer be found. It may have been deleted or aged out of the server's history -- refresh and try
// again." Never echoes the raw message back, same convention as describePathActionError/
// describeRuntimeActionError -- a network hiccup or a since-expired replay/spin/simulation entry is an
// everyday outcome of driving a real local server, not a bug worth surfacing verbatim.
export function describeReplayActionError(subject: string, message: string): string {
    if (isRuntimePreparationDiagnostic(message)) return message;
    const {status, remediation} = REPLAY_ACTION_ISSUE_COPY[classifyReplayActionErrorReason(message)](subject);
    return `${status} ${remediation}`;
}
