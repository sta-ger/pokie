import fs from "fs";
import path from "path";
import {isPathWithin} from "../isPathWithin.js";

export type StudioFsEntry = {name: string; isDirectory: boolean};

// Backs GET /api/home/fs/browse -- the "Browse" action on every filesystem-path input in Home's
// project-creation forms (Create/Init/Build from Blueprint). "error" never carries a stack trace, only
// a plain client-safe message (same convention as StudioScaffoldResultView etc.) -- an unreadable/
// missing/non-directory path is an expected outcome of letting a user type or navigate to anywhere on
// disk, not a failed request.
export type StudioFsBrowseView =
    | {status: "ok"; resolvedPath: string; displayPath: string; parentPath?: string; entries: StudioFsEntry[]}
    | {status: "error"; error: string; resolvedPath: string};

// Lists a directory's immediate children so the browser can offer a navigable folder/file picker
// without the browser itself ever having OS filesystem access -- Studio already runs as a local,
// single-user process with full access to the machine it's on (same trust boundary as every other
// Home/Project path-taking endpoint), so a plain readdir here adds no new exposure.
//
// `root` is the directory Studio itself was started in (StudioServerOptions.studioRoot) -- resolvedPath
// is rendered relative to it (e.g. "./games/foo") whenever it falls inside, and absolute otherwise, so a
// bare "." default in the frontend always has a concrete path to show instead.
export class StudioFsBrowseService {
    private readonly root: string;

    constructor(root: string) {
        this.root = root;
    }

    public browse(requestedPath: string | undefined): StudioFsBrowseView {
        const resolvedPath = path.resolve(this.root, requestedPath && requestedPath.trim().length > 0 ? requestedPath : ".");

        let stats: fs.Stats;
        try {
            stats = fs.statSync(resolvedPath);
        } catch (error) {
            return {status: "error", error: this.describeError(error, resolvedPath), resolvedPath};
        }
        if (!stats.isDirectory()) {
            return {status: "error", error: `"${resolvedPath}" is not a directory.`, resolvedPath};
        }

        let names: string[];
        try {
            names = fs.readdirSync(resolvedPath);
        } catch (error) {
            return {status: "error", error: this.describeError(error, resolvedPath), resolvedPath};
        }

        const entries = this.describeEntries(resolvedPath, names);
        const parentPath = path.dirname(resolvedPath);
        return {
            status: "ok",
            resolvedPath,
            displayPath: this.displayPath(resolvedPath),
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

    private displayPath(resolvedPath: string): string {
        if (resolvedPath === this.root) {
            return ".";
        }
        return isPathWithin(this.root, resolvedPath) ? `.${path.sep}${path.relative(this.root, resolvedPath)}` : resolvedPath;
    }

    private describeError(error: unknown, resolvedPath: string): string {
        const code = (error as NodeJS.ErrnoException)?.code;
        if (code === "ENOENT") {
            return `"${resolvedPath}" does not exist.`;
        }
        if (code === "EACCES" || code === "EPERM") {
            return `Permission denied reading "${resolvedPath}".`;
        }
        return error instanceof Error ? error.message : String(error);
    }
}
