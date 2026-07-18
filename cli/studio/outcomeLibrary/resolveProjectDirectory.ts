import fs from "fs";
import path from "path";
import {isPathWithin} from "../isPathWithin.js";

export type ResolveProjectDirectoryResult =
    | {readonly status: "ok"; readonly resolvedPath: string}
    | {readonly status: "error"; readonly message: string};

// The same lexical-then-realpath containment check loadWeightedOutcomeLibraryFromProjectFile applies to a
// single file, generalized to any project-relative path (a bundle directory, a Stake Engine export
// directory) -- guards against both a ".."-style escape in the path text and a symlink physically placed
// inside the project that points somewhere else entirely. A target that doesn't exist yet (or a broken
// symlink) simply isn't checked against realpath a second time -- the caller's own read attempt reports
// that the same familiar way it always has.
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

    let realPath: string | undefined;
    try {
        realPath = realpath(resolvedPath);
    } catch {
        realPath = undefined;
    }
    if (realPath !== undefined && !isPathWithin(realRoot, realPath)) {
        return {status: "error", message: `"${relativePath}" resolves, through a symlink, outside the project root.`};
    }

    return {status: "ok", resolvedPath};
}
