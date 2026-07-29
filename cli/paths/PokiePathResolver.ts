import path from "path";
import {resolveProjectDirectory, ResolveProjectDirectoryResult} from "../studio/outcomeLibrary/resolveProjectDirectory.js";
import {isUnsafeStartDirectory, UnsafeStartDirectoryContext} from "./isUnsafeStartDirectory.js";
import {resolveUserBaseDirectory} from "./PlatformDirectories.js";
import {defaultPlatformDirectoryEnvironment, PlatformDirectoryEnvironment} from "./PlatformDirectoryEnvironment.js";

const POKIE_PROJECTS_FOLDER_NAME = "POKIE";

export type IndependentProjectDirectoryResult =
    | {readonly status: "ok"; readonly directory: string; readonly source: "documents" | "home"}
    | {readonly status: "error"; readonly message: string};

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

    constructor(unsafeContext: UnsafeStartDirectoryContext = {}, env: PlatformDirectoryEnvironment = defaultPlatformDirectoryEnvironment()) {
        this.unsafeContext = unsafeContext;
        this.env = env;
    }

    public resolveIndependentProjectDirectory(name: string): IndependentProjectDirectoryResult {
        const trimmedName = name.trim();
        if (trimmedName.length === 0) {
            return {status: "error", message: "A project name is required."};
        }
        if (trimmedName.includes("/") || trimmedName.includes("\\") || trimmedName === "." || trimmedName === "..") {
            return {status: "error", message: `"${name}" is not a valid project name. Use a plain directory name, e.g. "sample-slot".`};
        }

        const base = resolveUserBaseDirectory(this.env);
        const directory = path.join(base.directory, POKIE_PROJECTS_FOLDER_NAME, trimmedName);
        if (isUnsafeStartDirectory(base.directory, this.unsafeContext) || isUnsafeStartDirectory(directory, this.unsafeContext)) {
            return {
                status: "error",
                message: `Could not determine a safe default project location (resolved to "${directory}"). Choose a destination directory explicitly.`,
            };
        }
        return {status: "ok", directory, source: base.source};
    }

    public resolveProjectRelativeDirectory(projectRoot: string, relativePath: string): ResolveProjectDirectoryResult {
        return resolveProjectDirectory(projectRoot, relativePath);
    }
}
