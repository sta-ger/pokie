// Classifies a scoped path action's raw failure text -- always either a raw Node fs/JSON exception message
// string-concatenated into a domain DTO server-side (e.g. `Could not read "${path}": ${error.message}`), or
// a hand-written request-validation rejection (e.g. '"path" is required.') -- into a stable reason, mirroring
// StudioFsBrowseService's own `StudioFsBrowseErrorReason` naming so a caller's remediation copy stays
// consistent with PathInput's own resolved-path hint. `schema` covers the one category browse never
// produces: a missing/malformed value rejected before any filesystem access is even attempted.
export type PathActionErrorReason = "network" | "absent" | "permission" | "type" | "schema" | "other";

type PathActionIssue = {status: string; remediation: string};

export function classifyPathActionErrorReason(message: string): PathActionErrorReason {
    if ((/failed to fetch|networkerror|econnrefused|enotfound/i).test(message)) {
        return "network";
    }
    if ((/ENOENT|does not exist\b|no such file or directory/i).test(message)) {
        return "absent";
    }
    if ((/EACCES|EPERM|permission denied/i).test(message)) {
        return "permission";
    }
    if ((/is a directory, not a file|is not a directory\b|" is a directory\.?$/i).test(message)) {
        return "type";
    }
    if ((/is required\.|must be a non-empty string|is not valid JSON|unexpected token .*json/i).test(message)) {
        return "schema";
    }
    return "other";
}

const PATH_ACTION_ISSUE_COPY: Record<PathActionErrorReason, (subject: string) => PathActionIssue> = {
    network: (subject) => ({status: `${subject} couldn't reach POKIE Studio.`, remediation: "Start or restart Studio, then try again."}),
    absent: (subject) => ({status: `${subject} could not be found.`, remediation: "Check the path and try again."}),
    permission: (subject) => ({status: `${subject} isn't readable.`, remediation: "Check its permissions and try again."}),
    type: (subject) => ({
        status: `${subject} points to the wrong kind of item.`,
        remediation: "Check whether it should be a file or a folder, and try again.",
    }),
    schema: (subject) => ({status: `${subject} is missing or invalid.`, remediation: "Provide a valid value and try again."}),
    other: (subject) => ({
        status: `${subject} could not be completed.`,
        remediation: "Try again. If it continues, choose the location again and retry.",
    }),
};

// Turns a scoped path action's raw backend failure text into inline, subject-specific status + remediation
// copy -- e.g. describePathActionError("The blueprint file", 'ENOENT: no such file or directory, ...') ->
// "The blueprint file could not be found. Check the path and try again." Never echoes the raw message back:
// an absent/permission/wrong-type/schema failure is an expected, everyday outcome of a user-typed path, not
// a bug worth surfacing verbatim (see docs/studio-phase2-inventory.md's Raw-error surfaces finding).
export function describePathActionError(subject: string, message: string): string {
    const {status, remediation} = PATH_ACTION_ISSUE_COPY[classifyPathActionErrorReason(message)](subject);
    return `${status} ${remediation}`;
}
