import os from "os";
import path from "path";
import {isPathWithin} from "../studio/isPathWithin.js";

export type UnsafeStartDirectoryContext = {
    // The directory the current process was launched from -- a default-resolution algorithm must never
    // silently fall back to it (an explicit, user-typed path that happens to equal CWD is a different,
    // legitimate contract -- see PokiePathResolver's own comment). Defaults to process.cwd().
    readonly cwd?: string;
    // Where the running `pokie` package itself is installed (its own package.json's directory), and by
    // extension everything under it (node_modules, dist, source).
    readonly installRoot?: string;
    // Studio's own internal asset/runtime directory (StudioServerOptions.studioRoot) -- never a
    // sensible place to create or store a user's game project.
    readonly studioRoot?: string;
};

const UNSAFE_SEGMENT_NAMES = new Set(["node_modules", "dist"]);

// True when `candidate` is, or falls inside, a directory a *default*-resolution algorithm must never
// silently hand back: the process's own CWD, the OS temp/cache directory, POKIE's own install root or
// Studio's own internal asset directory (both as ancestors, and as a bare "node_modules"/"dist" path
// segment anywhere along the way -- so the check still catches these even when a caller only has a
// partial context to offer). This is a guard on *computed defaults*, not a blanket validator for every
// user-supplied path in the app: an explicit, user-chosen destination (e.g. `pokie init` scaffolding
// the directory it was invoked from, or a test fixture writing into os.tmpdir()) is a deliberate choice
// the user or caller made, not a silent one this check is meant to catch.
export function isUnsafeStartDirectory(candidate: string, context: UnsafeStartDirectoryContext = {}): boolean {
    const resolved = path.resolve(candidate);
    const cwd = path.resolve(context.cwd ?? process.cwd());

    if (resolved === cwd) {
        return true;
    }
    if (isPathWithin(path.resolve(os.tmpdir()), resolved)) {
        return true;
    }
    if (context.installRoot !== undefined && isPathWithin(path.resolve(context.installRoot), resolved)) {
        return true;
    }
    if (context.studioRoot !== undefined && isPathWithin(path.resolve(context.studioRoot), resolved)) {
        return true;
    }
    return resolved.split(path.sep).some((segment) => UNSAFE_SEGMENT_NAMES.has(segment));
}
