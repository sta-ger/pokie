import fs from "fs";
import path from "path";
import {isPathWithin} from "../isPathWithin.js";

export type StudioFsEntry = {name: string; isDirectory: boolean};

// Backs GET /api/home/fs/browse -- the "Browse" action (and PathInput's own live resolved-path hint) on
// every filesystem-path input across Home *and* Project surfaces. "error" never carries a stack trace,
// only a plain client-safe message (same convention as StudioScaffoldResultView etc.) -- an unreadable/
// missing/non-directory path is an expected outcome of letting a user type or navigate to anywhere on
// disk, not a failed request. `reason` classifies that same message so a caller (PathInput's hint) can
// key its own tone/remediation copy off a stable value instead of pattern-matching `error` text.
export type StudioFsBrowseView =
    | {status: "ok"; resolvedPath: string; displayPath: string; parentPath?: string; entries: StudioFsEntry[]}
    | {status: "error"; error: string; resolvedPath: string; reason: "absent" | "type" | "permission" | "other"};

// Lists a directory's immediate children so the browser can offer a navigable folder/file picker
// without the browser itself ever having OS filesystem access -- Studio already runs as a local,
// single-user process with full access to the machine it's on (same trust boundary as every other
// Home/Project path-taking endpoint), so a plain readdir here adds no new exposure.
//
// `root` is the directory Studio itself was started in (StudioServerOptions.studioRoot) -- resolvedPath
// is rendered relative to it (e.g. "./games/foo") whenever it falls inside, and as the root's own
// absolute path when it *is* the root, so the frontend never has to fall back to a bare "." default.
export class StudioFsBrowseService {
    private readonly root: string;

    constructor(root: string) {
        this.root = root;
    }

    // `base`, when given, resolves/display-relativizes `requestedPath` against it instead of `this.root`
    // -- lets a project-scoped path field (e.g. Certification's bundle directory, which the server itself
    // always resolves relative to the *project* root, not wherever `pokie studio` happened to be started
    // from) get a truthful hint instead of one silently computed against the wrong base. Never a new
    // exposure: this service already lets a caller browse anywhere on disk regardless of `base`.
    public browse(requestedPath: string | undefined, base?: string): StudioFsBrowseView {
        const resolveBase = base && base.trim().length > 0 ? path.resolve(base) : this.root;
        const resolvedPath = path.resolve(resolveBase, requestedPath && requestedPath.trim().length > 0 ? requestedPath : ".");

        let stats: fs.Stats;
        try {
            stats = fs.statSync(resolvedPath);
        } catch (error) {
            return {status: "error", ...this.describeError(error, resolvedPath), resolvedPath};
        }
        if (!stats.isDirectory()) {
            return {status: "error", error: `"${resolvedPath}" is not a directory.`, resolvedPath, reason: "type"};
        }

        let names: string[];
        try {
            names = fs.readdirSync(resolvedPath);
        } catch (error) {
            return {status: "error", ...this.describeError(error, resolvedPath), resolvedPath};
        }

        const entries = this.describeEntries(resolvedPath, names);
        const parentPath = path.dirname(resolvedPath);
        return {
            status: "ok",
            resolvedPath,
            displayPath: this.displayPath(resolvedPath, resolveBase),
            parentPath: parentPath === resolvedPath ? undefined : parentPath,
            entries,
        };
    }

    private describeEntries(resolvedPath: string, names: string[]): StudioFsEntry[] {
        return names
            .filter((name) => !name.startsWith("."))
            .map((name) => {
                let isDirectory = false;
                try {
                    isDirectory = fs.statSync(path.join(resolvedPath, name)).isDirectory();
                } catch {
                    // An entry that disappears or can't be stat'd between readdir and here (a broken
                    // symlink, a race with another process) is simply listed as a file -- never worth
                    // failing the whole listing over.
                    isDirectory = false;
                }
                return {name, isDirectory};
            })
            .sort((a, b) => {
                if (a.isDirectory !== b.isDirectory) {
                    return a.isDirectory ? -1 : 1;
                }
                return a.name.localeCompare(b.name);
            });
    }

    private displayPath(resolvedPath: string, base: string): string {
        if (resolvedPath === base) {
            return resolvedPath;
        }
        return isPathWithin(base, resolvedPath) ? `.${path.sep}${path.relative(base, resolvedPath)}` : resolvedPath;
    }

    private describeError(error: unknown, resolvedPath: string): {error: string; reason: "absent" | "permission" | "other"} {
        const code = (error as NodeJS.ErrnoException)?.code;
        if (code === "ENOENT") {
            return {error: `"${resolvedPath}" does not exist.`, reason: "absent"};
        }
        if (code === "EACCES" || code === "EPERM") {
            return {error: `Permission denied reading "${resolvedPath}".`, reason: "permission"};
        }
        return {error: error instanceof Error ? error.message : String(error), reason: "other"};
    }
}
