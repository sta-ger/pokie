import path from "path";
import {resolveProjectDirectory, ResolveProjectDirectoryResult} from "../studio/outcomeLibrary/resolveProjectDirectory.js";
import {isUnsafeStartDirectory, UnsafeStartDirectoryContext} from "./isUnsafeStartDirectory.js";
import {resolveUserBaseDirectory, UserBaseDirectoryResult} from "./PlatformDirectories.js";
import {defaultPlatformDirectoryEnvironment, PlatformDirectoryEnvironment} from "./PlatformDirectoryEnvironment.js";

const POKIE_PROJECTS_FOLDER_NAME = "POKIE";

// Mirrors PlatformDirectories.ts's DirectoryUsabilityResult/UserBaseDirectoryResult states, plus the two
// concerns only this class can detect: "invalid-name" (the caller-supplied project name itself, before
// any path resolution happens) and "unsafe-path" (isUnsafeStartDirectory.ts). Kept as one flat
// discriminated union -- rather than nesting PlatformDirectories' result inside an outer ok/error shape
// -- so every caller gets the same single `switch (result.status)` regardless of which layer produced
// the failure.
export type IndependentProjectDirectoryResult =
    | {readonly status: "valid"; readonly directory: string; readonly source: "documents" | "home"}
    | {readonly status: "invalid-name"; readonly message: string}
    | {readonly status: "absent"; readonly message: string}
    | {readonly status: "type"; readonly message: string}
    | {readonly status: "permission"; readonly message: string}
    | {readonly status: "unresolved"; readonly message: string}
    | {readonly status: "unsafe-path"; readonly message: string};

// The one reusable path-resolution policy every "where does a new, independent POKIE project go by
// default" and "does this path actually stay inside the project I already know about" decision in both
// the CLI and Studio should be built on, rather than each caller growing its own ad hoc guess or its own
// containment check. Two distinct jobs, kept on one class because Studio's Home surface needs both from
// the same request:
//   - resolveIndependentProjectDirectory: a brand-new project with no existing parent to anchor to --
//     platform Documents/POKIE/<name>, falling back to Home/POKIE/<name> (see PlatformDirectories.ts),
//     with isUnsafeStartDirectory.ts as a defense-in-depth check against ever handing back CWD, POKIE's
//     own install root, Studio's own internal directory, or a temp/cache directory.
//   - resolveProjectRelativeDirectory: a path that must live inside an *already known* project root --
//     delegates to resolveProjectDirectory (cli/studio/outcomeLibrary/resolveProjectDirectory.ts), the
//     existing lexical-plus-realpath containment check every project-scoped Studio service (Stake
//     Engine export, Fairness, Certification, Outcome Libraries) already shares, so this doesn't grow a
//     second, divergent implementation of the same guard.
//
// Deliberately does not replace `pokie create`/`pokie init`'s own `process.cwd()`-based directory
// (CreateCommand/InitCommand): a CLI command invoked from a specific directory is an explicit, user-
// chosen destination, not an implicit default this class exists to compute on the user's behalf.
export class PokiePathResolver {
    private readonly unsafeContext: UnsafeStartDirectoryContext;
    private readonly env: PlatformDirectoryEnvironment;
    private readonly resolveBase: (env: PlatformDirectoryEnvironment) => UserBaseDirectoryResult;

    constructor(
        unsafeContext: UnsafeStartDirectoryContext = {},
        env: PlatformDirectoryEnvironment = defaultPlatformDirectoryEnvironment(),
        resolveBase: (env: PlatformDirectoryEnvironment) => UserBaseDirectoryResult = resolveUserBaseDirectory,
    ) {
        this.unsafeContext = unsafeContext;
        this.env = env;
        this.resolveBase = resolveBase;
    }

    public resolveIndependentProjectDirectory(name: string): IndependentProjectDirectoryResult {
        const trimmedName = name.trim();
        if (trimmedName.length === 0) {
            return {status: "invalid-name", message: "A project name is required."};
        }
        if (trimmedName.includes("/") || trimmedName.includes("\\") || trimmedName === "." || trimmedName === "..") {
            return {status: "invalid-name", message: `"${name}" is not a valid project name. Use a plain directory name, e.g. "sample-slot".`};
        }

        const base = this.resolveBase(this.env);
        if (base.status === "unresolved") {
            return {status: "unresolved", message: "Could not determine the current user's home directory."};
        }
        if (base.status !== "valid") {
            return {status: base.status, message: `The default project location "${base.directory}" ${describeUnusability(base.status)}.`};
        }

        // Constructed and evaluated with the *target* platform's path semantics (path.win32/path.posix),
        // not whatever the host OS running this process happens to use -- resolving a win32 base
        // directory with the host's own `path.join` would silently mix backslash and forward-slash
        // separators whenever the host isn't actually Windows (e.g. under test, or a cross-platform
        // Studio backend).
        const platformPath = this.env.platform === "win32" ? path.win32 : path.posix;
        const directory = platformPath.join(base.directory, POKIE_PROJECTS_FOLDER_NAME, trimmedName);
        // Judged with the *target* platform's containment semantics too (see isUnsafeStartDirectory.ts),
        // not whatever this.unsafeContext's own caller happened to assume -- so a win32 base directory
        // resolved above is checked against Windows drive/UNC rules even when this runs on a POSIX host.
        const unsafeContext: UnsafeStartDirectoryContext = {...this.unsafeContext, platform: this.env.platform};
        if (isUnsafeStartDirectory(base.directory, unsafeContext) || isUnsafeStartDirectory(directory, unsafeContext)) {
            return {
                status: "unsafe-path",
                message: `Could not determine a safe default project location (resolved to "${directory}"). Choose a destination directory explicitly.`,
            };
        }
        return {status: "valid", directory, source: base.source};
    }

    public resolveProjectRelativeDirectory(projectRoot: string, relativePath: string): ResolveProjectDirectoryResult {
        return resolveProjectDirectory(projectRoot, relativePath);
    }
}

function describeUnusability(status: "absent" | "type" | "permission"): string {
    switch (status) {
        case "absent":
            return "does not exist";
        case "type":
            return "is not a directory";
        case "permission":
            return "is not writable";
        default:
            return status satisfies never;
    }
}
