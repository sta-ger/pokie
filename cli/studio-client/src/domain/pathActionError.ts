// Classifies a scoped path action's raw failure text -- always either a raw Node fs/JSON exception message
// string-concatenated into a domain DTO server-side (e.g. `Could not read "${path}": ${error.message}`), or
// a hand-written request-validation rejection (e.g. '"path" is required.') -- into a stable reason, mirroring
// StudioFsBrowseService's own `StudioFsBrowseErrorReason` naming so a caller's remediation copy stays
// consistent with PathInput's own resolved-path hint. `schema` covers the one category browse never
// produces: a missing/malformed value rejected before any filesystem access is even attempted.
export type PathActionErrorReason = "network" | "absent" | "permission" | "type" | "schema" | "destination" | "name" | "workbook" | "suffix" | "other";

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
    if ((/is a directory, not a file|is a folder, not a file|is a file, not a folder|is not a directory\b|" is a directory\.?$/i).test(message)) {
        return "type";
    }
    if ((/is required\.|must be a non-empty string|is not valid JSON|unexpected token .*json/i).test(message)) {
        return "schema";
    }
    if ((/not a zip archive|not an? (?:valid )?xlsx|invalid (?:xlsx|workbook|worksheet)|could not read .*par sheet|corrupt.*(?:xlsx|workbook)/i).test(message)) {
        return "workbook";
    }
    if ((/must be saved as a file ending in "\.json"|ending in "\.json"/i).test(message)) {
        return "suffix";
    }
    if ((/no free managed project name|no available managed project name|Game id .* already exists|already exists.*Choose a different Game id/i).test(message)) {
        return "name";
    }
    if ((/safe default project location|choose a destination directory explicitly|managed project location|no available managed project/i).test(message)) {
        return "destination";
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
    destination: (subject) => ({
        status: `${subject} needs a destination Studio can use.`,
        remediation: "Use a different Game id, or start Studio from a folder with a writable POKIE Projects location, then try again.",
    }),
    // This reason is only produced by the managed-project Game-id collision, so name the id
    // directly instead of turning the generic subject ("Your game") into "Your game name".
    name: () => ({
        status: "That Game id is already taken.",
        remediation: "Choose a different Game id, or open the existing project.",
    }),
    workbook: (subject) => ({
        status: `${subject} isn't a readable PAR workbook.`,
        remediation: "Choose an .xlsx file exported from POKIE or another spreadsheet tool, then try again.",
    }),
    suffix: (subject) => ({
        status: `${subject} needs a file name ending in ".json".`,
        remediation: 'Choose a name such as "game.blueprint.json", then try again.',
    }),
    other: (subject) => ({
        status: `${subject} could not be completed.`,
        remediation: "Try again. If it continues, choose the location again and retry.",
    }),
};

// Turns a scoped path action's raw backend failure text into inline, subject-specific status + remediation
// copy -- e.g. describePathActionError("The blueprint file", 'ENOENT: no such file or directory, ...') ->
// "The blueprint file could not be found. Check the path and try again." Never echoes the raw message back:
// an absent/permission/wrong-type/schema failure is an expected, everyday outcome of a user-typed path, not
// a bug worth surfacing verbatim.
export function describePathActionError(subject: string, message: string): string {
    const {status, remediation} = PATH_ACTION_ISSUE_COPY[classifyPathActionErrorReason(message)](subject);
    return `${status} ${remediation}`;
}

// "Open existing project" can still fail for a source the collision check could not vet (a drive
// disconnected between the save check and the open, a package that no longer loads, ...). Never show
// the raw `ENOTDIR`/`package.json` text to a math author: name the recoverable choice instead.
export function describeExistingProjectOpenError(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    const detail = typeof (error as {detail?: unknown} | null)?.detail === "string" ? (error as {detail: string}).detail : "";
    const combined = detail.length > 0 ? `${message}\n${detail}` : message;
    if ((/ENOTDIR|not a directory|package\.json/i).test(combined)) {
        return "That existing project could not be opened. It may be an older POKIE project or a damaged file. Choose a different Game id to save a new design, or return to Your projects and repair the old one.";
    }
    return describePathActionError("The existing project", combined);
}

// The generic "Game id already taken" copy correctly offers "open the existing project", but only
// when Studio actually returned a path it can open. A collision with an older/damaged file has no such
// action; keep its recovery copy from promising a button that is not there.
export function describeManagedSaveFailure(message: string): string {
    if ((/cannot be opened as a current POKIE project/i).test(message)) {
        return "That Game id belongs to a game design Studio can't open as a current project. Choose a different Game id, or move or repair the old file if you still need it.";
    }
    return describePathActionError("Your game", message);
}
