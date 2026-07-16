import type {WeightedOutcomeLibrary} from "pokie";
import fs from "fs";
import path from "path";
import {isPathWithin} from "../isPathWithin.js";

export type LoadWeightedOutcomeLibraryResult =
    | {readonly status: "ok"; readonly library: WeightedOutcomeLibrary<string>}
    | {readonly status: "error"; readonly message: string};

// Reads and parses one mode's own WeightedOutcomeLibrary JSON file, resolved relative to the active
// project's own root — the same "a path, never an inline blob" convention every other Project
// Dashboard feature (Inspect/Validate/Simulate/Replay) already follows. "libraryPath" is refused
// outright (status: "error", never a thrown exception) when it resolves outside `projectRoot` — the
// same isPathWithin guard StudioBlueprintService's own load()/save() use, applied here to keep a
// deployment request from reading arbitrary files off the host filesystem.
//
// That lexical check alone only rules out a ".."-style escape in the path text itself — it says
// nothing about a symlink physically placed inside the project that points somewhere else entirely
// (e.g. "projectRoot/link.json -> /etc/passwd"), which fs.readFileSync would happily follow without
// ever touching a path outside the project literally. So containment is re-checked a second time
// against realpath(2) — where the path (and every symlink along the way) actually resolves on disk —
// once it's known to exist; a target that doesn't exist (or a broken symlink) has nothing to check and
// falls through to the ordinary read attempt below, which reports that the same familiar way it always
// has. realpath is resolved on both sides (the project root too) so a symlinked *root* itself (common
// for OS temp directories) can never produce a false escape report.
//
// Only ever parses JSON — never validates the result's own shape as a genuine WeightedOutcomeLibrary.
// That's deliberately left to ExternalDeploymentService's own pipeline (via
// WeightedOutcomeLibraryValidator, run as part of compatibility validation) once this function's
// result is handed to it — StudioDeploymentService never re-implements that check itself.
export function loadWeightedOutcomeLibraryFromProjectFile(
    projectRoot: string,
    libraryPath: string,
    readFile: (resolvedPath: string) => string = (resolvedPath) => fs.readFileSync(resolvedPath, "utf-8"),
    // Separately injectable from `readFile` (defaults to the real fs.realpathSync) so a test double for
    // one doesn't have to fake the other — most tests only care about content, not symlink containment,
    // and shouldn't need a real project root on disk just to satisfy this check.
    realpath: (resolvedPath: string) => string = (resolvedPath) => fs.realpathSync(resolvedPath),
): LoadWeightedOutcomeLibraryResult {
    const resolvedRoot = path.resolve(projectRoot);
    const resolvedPath = path.resolve(resolvedRoot, libraryPath);
    if (!isPathWithin(resolvedRoot, resolvedPath)) {
        return {status: "error", message: `"${libraryPath}" resolves outside the project root.`};
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
        realPath = undefined; // doesn't exist (or a broken symlink) — the read attempt below reports this
    }
    if (realPath !== undefined && !isPathWithin(realRoot, realPath)) {
        return {status: "error", message: `"${libraryPath}" resolves, through a symlink, outside the project root.`};
    }

    let raw: string;
    try {
        raw = readFile(resolvedPath);
    } catch (error) {
        return {status: "error", message: `Could not read "${libraryPath}": ${error instanceof Error ? error.message : String(error)}`};
    }

    try {
        return {status: "ok", library: JSON.parse(raw) as WeightedOutcomeLibrary<string>};
    } catch (error) {
        return {status: "error", message: `"${libraryPath}" is not valid JSON: ${error instanceof Error ? error.message : String(error)}`};
    }
}
