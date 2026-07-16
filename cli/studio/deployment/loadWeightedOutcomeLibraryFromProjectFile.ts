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
// Only ever parses JSON — never validates the result's own shape as a genuine WeightedOutcomeLibrary.
// That's deliberately left to ExternalDeploymentService's own pipeline (via
// WeightedOutcomeLibraryValidator, run as part of compatibility validation) once this function's
// result is handed to it — StudioDeploymentService never re-implements that check itself.
export function loadWeightedOutcomeLibraryFromProjectFile(
    projectRoot: string,
    libraryPath: string,
    readFile: (resolvedPath: string) => string = (resolvedPath) => fs.readFileSync(resolvedPath, "utf-8"),
): LoadWeightedOutcomeLibraryResult {
    const resolvedRoot = path.resolve(projectRoot);
    const resolvedPath = path.resolve(resolvedRoot, libraryPath);
    if (!isPathWithin(resolvedRoot, resolvedPath)) {
        return {status: "error", message: `"${libraryPath}" resolves outside the project root.`};
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
