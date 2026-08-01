import fs from "fs";
import path from "path";
import {readPokiePackageConfig} from "../../gamepackage/readPokiePackageConfig.js";
import type {ProjectTargetManifestRecognition} from "./ProjectTargetManifestRecognition.js";

// A lightweight recognition check for ProjectTargetResolver's tsPackage adapter — reuses
// readPokiePackageConfig, the same "pokie.entry" contract findPokieProjectRoot/loadPokieGame themselves read,
// rather than re-deriving a second definition of "what makes a directory a POKIE package" here. A directory
// with no package.json, or one with a package.json that never mentions a "pokie" field at all, is "unrelated"
// — an ordinary npm package.json is far too common a file to fail closed on just because it isn't a POKIE
// package. But a package.json that fails to parse as JSON, or that does declare a "pokie" field yet fails
// readPokiePackageConfig's own validation (e.g. a missing/blank "pokie.entry"), has already signalled intent
// to be a POKIE package and gotten the shape wrong — that's "malformed", not "unrelated" (see
// ProjectTargetManifestRecognition's own doc comment).
export function recognizePokieTsPackageDirectory(dir: string): ProjectTargetManifestRecognition {
    const packageJsonPath = path.join(dir, "package.json");

    let packageJsonContent: string;
    try {
        packageJsonContent = fs.readFileSync(packageJsonPath, "utf-8");
    } catch {
        return {kind: "unrelated"};
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(packageJsonContent);
    } catch (error) {
        return {
            kind: "malformed",
            reason: `Could not parse "${packageJsonPath}" as JSON: ${error instanceof Error ? error.message : String(error)}`,
        };
    }

    const declaresPokieField =
        typeof parsed === "object" && parsed !== null && (parsed as {pokie?: unknown}).pokie !== undefined;
    if (!declaresPokieField) {
        return {kind: "unrelated"};
    }

    try {
        readPokiePackageConfig(dir);
        return {kind: "recognized"};
    } catch (error) {
        return {kind: "malformed", reason: error instanceof Error ? error.message : String(error)};
    }
}
