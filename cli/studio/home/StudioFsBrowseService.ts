import fs from "fs";
import path from "path";
import {isPathWithin} from "../isPathWithin.js";

export type StudioFsEntry = {name: string; isDirectory: boolean};

// `reason` classifies a browse "error" outcome so a caller (PathInput's hint) can key its own tone/
// remediation copy off a stable value instead of pattern-matching `error` text -- see StudioFsBrowseView's
// own doc comment for what each value means. "unresolved" and "symlink-escape" are only ever produced when
// a caller passes an explicit `base` (a project-scoped field, e.g. Certification's bundle directory) --
// see browse()'s own doc comment.
export type StudioFsBrowseErrorReason = "absent" | "type" | "permission" | "unresolved" | "symlink-escape" | "other";

// Backs GET /api/home/fs/browse -- the "Browse" action (and PathInput's own live resolved-path hint) on
// every filesystem-path input across Home *and* Project surfaces. "error" never carries a stack trace,
// only a plain client-safe message (same convention every other Home DTO follows) -- an unreadable/
// missing/non-directory path is an expected outcome of letting a user type or navigate to anywhere on
// disk, not a failed request. `reason` classifies that same message so a caller (PathInput's hint) can
// key its own tone/remediation copy off a stable value instead of pattern-matching `error` text.
export type StudioFsBrowseView =
    | {status: "ok"; resolvedPath: string; displayPath: string; parentPath?: string; entries: StudioFsEntry[]; isDirectory: boolean}
    | {status: "error"; error: string; resolvedPath: string; reason: StudioFsBrowseErrorReason};

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
    private readonly realpath: (resolvedPath: string) => string;

    constructor(
        root: string,
        // Separately injectable (defaults to the real fs.realpathSync) so a test double doesn't need real
        // symlinks on disk just to exercise the ordinary listing path -- same convention as
        // resolveProjectDirectory/StudioCertificationService's own `realpath` constructor params.
        realpath: (resolvedPath: string) => string = (resolvedPath) => fs.realpathSync(resolvedPath),
    ) {
        this.root = root;
        this.realpath = realpath;
    }

    // `base`, when given, resolves/display-relativizes `requestedPath` against it instead of `this.root`
    // -- lets a project-scoped path field (e.g. Certification's bundle directory, which the server itself
    // always resolves relative to the *project* root, not wherever `pokie studio` happened to be started
    // from) get a truthful hint instead of one silently computed against the wrong base. Never a new
    // exposure: this service already lets a caller browse anywhere on disk regardless of `base` -- a
    // ".."-style or absolute escape out of `base` is an ordinary, already-supported outcome, not an error
    // (see the "renders a resolved path outside the root as an absolute path" test).
    //
    // What *is* flagged (reason: "symlink-escape", only when `base` is explicit) is the more deceptive
    // case: `resolvedPath` looks like it's inside `base` lexically, but a symlink somewhere along the way
    // actually places it outside on disk -- the same containment resolveProjectDirectory enforces before
    // Certification/Deployment/Stake Engine Export/Provably Fair actually act on this same field's value,
    // surfaced here so the picker can warn about it before the user ever submits.
    // `kind`, when "file", validates/resolves `requestedPath` as a file instead of a directory -- no
    // readdir is attempted (a file has no children to list), so a `kind: "file"` call's own "ok" always
    // comes back with an empty `entries`, but still carries `parentPath` (the file's own containing
    // directory) so a caller wanting a browsable *location* for a file value -- see
    // resolveBrowseStartLocation's own doc comment -- doesn't have to derive it itself. `kind: "any"`
    // accepts either a file or a directory -- never a "type" error -- for a field like Import Project's
    // own Location, which genuinely takes both a package directory and a single project file (a Blueprint
    // JSON, a PAR workbook, ...). Defaults to "directory" (every existing caller -- PathBrowseModal's own
    // directory-listing navigation, and any caller that omits it entirely) so directory browsing/listing
    // is completely unaffected by this parameter's existence.
    public browse(requestedPath: string | undefined, base?: string, kind: "directory" | "file" | "any" = "directory"): StudioFsBrowseView {
        const explicitBase = base !== undefined && base.trim().length > 0;
        const resolveBase = explicitBase ? path.resolve(base) : this.root;
        const resolvedPath = path.resolve(resolveBase, requestedPath && requestedPath.trim().length > 0 ? requestedPath : ".");

        let stats: fs.Stats;
        try {
            stats = fs.statSync(resolvedPath);
        } catch (error) {
            return {status: "error", ...this.describeError(error, resolvedPath), resolvedPath};
        }
        if (kind === "file" && stats.isDirectory()) {
            return {status: "error", error: `"${resolvedPath}" is a directory, not a file.`, resolvedPath, reason: "type"};
        }
        if (kind === "directory" && !stats.isDirectory()) {
            return {status: "error", error: `"${resolvedPath}" is not a directory.`, resolvedPath, reason: "type"};
        }
        // The lexical isPathWithin check gates this: a ".." or absolute `requestedPath` that already,
        // textually, resolves outside `resolveBase` is the ordinary "browse anywhere" outcome above, not
        // this check's concern -- only a path that *looks* contained is worth a symlink follow-up at all.
        if (explicitBase && isPathWithin(resolveBase, resolvedPath) && this.escapesThroughSymlink(resolveBase, resolvedPath)) {
            return {status: "error", error: `"${resolvedPath}" resolves, through a symlink, outside "${resolveBase}".`, resolvedPath, reason: "symlink-escape"};
        }

        if (!stats.isDirectory()) {
            const parentPath = path.dirname(resolvedPath);
            return {
                status: "ok",
                resolvedPath,
                displayPath: this.displayPath(resolvedPath, resolveBase),
                parentPath: parentPath === resolvedPath ? undefined : parentPath,
                entries: [],
                isDirectory: false,
            };
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
            isDirectory: true,
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

    // True when `resolvedPath` exists (already confirmed by the caller's own successful statSync) but its
    // real, on-disk location -- following every symlink along the way -- isn't actually inside `base`'s own
    // real location. Either side failing to realpath is never this check's concern: an unresolvable `base`
    // is a different failure entirely, and `resolvedPath` is already known to exist.
    private escapesThroughSymlink(base: string, resolvedPath: string): boolean {
        let realBase: string;
        let realResolved: string;
        try {
            realBase = this.realpath(base);
            realResolved = this.realpath(resolvedPath);
        } catch {
            return false;
        }
        return !isPathWithin(realBase, realResolved);
    }

    private describeError(error: unknown, resolvedPath: string): {error: string; reason: "absent" | "unresolved" | "permission" | "other"} {
        const code = (error as NodeJS.ErrnoException)?.code;
        if (code === "ENOENT") {
            // statSync follows symlinks, so a dangling symlink (the entry itself exists, its target
            // doesn't) reports the same ENOENT as nothing being there at all -- lstat (which doesn't
            // follow) distinguishes the two so the hint can say "broken link" instead of "doesn't exist".
            if (this.isDanglingSymlink(resolvedPath)) {
                return {error: `"${resolvedPath}" is a broken link and can't be resolved.`, reason: "unresolved"};
            }
            return {error: `"${resolvedPath}" does not exist.`, reason: "absent"};
        }
        if (code === "EACCES" || code === "EPERM") {
            return {error: `Permission denied reading "${resolvedPath}".`, reason: "permission"};
        }
        return {error: error instanceof Error ? error.message : String(error), reason: "other"};
    }

    private isDanglingSymlink(resolvedPath: string): boolean {
        try {
            return fs.lstatSync(resolvedPath).isSymbolicLink();
        } catch {
            return false;
        }
    }
}
