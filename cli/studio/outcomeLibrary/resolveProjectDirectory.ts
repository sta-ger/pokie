import fs from "fs";
import path from "path";
import {isPathWithin} from "../isPathWithin.js";

export type ResolveProjectDirectoryResult =
    | {readonly status: "ok"; readonly resolvedPath: string}
    | {readonly status: "error"; readonly message: string};

// The same lexical-then-realpath containment check loadWeightedOutcomeLibraryFromProjectFile applies to a
// single file, generalized to any project-relative path (a bundle directory, a Stake Engine export
// directory, or a not-yet-existing output directory a caller is about to write into) -- guards against
// both a ".."-style escape in the path text and a symlink physically placed inside the project that
// points somewhere else entirely.
//
// A target that doesn't exist yet is never simply exempted from the realpath check: doing so would leave
// a write-target caller (e.g. the Certification tab's build outDir) wide open to a *nested* symlink
// escape -- an existing ancestor directory somewhere under the project root that is itself a symlink
// pointing outside it, with the requested path's remaining, not-yet-existing components appended past
// that point. Instead, this walks up from the requested path to the nearest ancestor that actually
// exists, realpath()s *that*, and checks containment against it -- the same thing a subsequent
// `fs.mkdir(resolvedPath, {recursive: true})` would physically walk through on disk. An entirely
// non-existent path (no ancestor below the project root itself exists) simply resolves the check against
// the project root, same as before. Only a genuinely broken symlink *at the exact requested path* (whose
// own nearest existing ancestor is unremarkable) falls through unresolved here, same as always -- the
// caller's own read/write attempt reports that in its own familiar way.
export function resolveProjectDirectory(
    projectRoot: string,
    relativePath: string,
    realpath: (resolvedPath: string) => string = (resolvedPath) => fs.realpathSync(resolvedPath),
): ResolveProjectDirectoryResult {
    const resolvedRoot = path.resolve(projectRoot);
    const resolvedPath = path.resolve(resolvedRoot, relativePath);
    if (!isPathWithin(resolvedRoot, resolvedPath)) {
        return {status: "error", message: `"${relativePath}" resolves outside the project root.`};
    }

    let realRoot: string;
    try {
        realRoot = realpath(resolvedRoot);
    } catch (error) {
        return {status: "error", message: `Could not resolve the project root "${resolvedRoot}": ${error instanceof Error ? error.message : String(error)}`};
    }

    const realNearestAncestor = resolveNearestExistingAncestor(resolvedPath, resolvedRoot, realpath);
    if (realNearestAncestor !== undefined && !isPathWithin(realRoot, realNearestAncestor)) {
        return {status: "error", message: `"${relativePath}" resolves, through a symlink, outside the project root.`};
    }

    return {status: "ok", resolvedPath};
}

// Walks upward from `candidatePath` (inclusive) until `realpath` succeeds, stopping no earlier than
// `resolvedRoot` -- `resolvedRoot` itself is guaranteed to exist by the time this is called (its own
// realpath() call above already succeeded), so this always terminates with a real answer, never an
// infinite climb past the filesystem root.
function resolveNearestExistingAncestor(candidatePath: string, resolvedRoot: string, realpath: (resolvedPath: string) => string): string | undefined {
    let candidate = candidatePath;
    for (;;) {
        try {
            return realpath(candidate);
        } catch {
            if (candidate === resolvedRoot) {
                return undefined;
            }
            const parent = path.dirname(candidate);
            if (parent === candidate) {
                return undefined;
            }
            candidate = parent;
        }
    }
}
