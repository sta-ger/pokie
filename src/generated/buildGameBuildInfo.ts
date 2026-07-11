import crypto from "crypto";
import {GAME_BLUEPRINT_SCHEMA_VERSION, type GameBlueprint} from "./GameBlueprint.js";
import type {GameBuildInfo} from "./GameBuildInfo.js";

// The fixed set of paths (relative to the package root) that GamePackageGenerator writes on every
// run. Also the default for buildGameBuildInfo's "generatedFiles" param, and GamePackageGenerator's
// fallback when an existing build-info.json predates the "files" field.
export const GENERATED_PACKAGE_FILES = ["package.json", "README.md", "src/generated/index.js", "src/generated/build-info.json"];

// Hashes the blueprint exactly as loaded (same object that gets embedded into the generated module),
// so re-running "pokie build" on an unchanged blueprint reproduces the same hash — a cheap way to tell
// "regenerated, nothing changed" apart from "regenerated, blueprint changed" without diffing JSON.
export function buildGameBuildInfo(
    blueprint: GameBlueprint,
    pokieVersion: string,
    sourcePath?: string,
    generatedAt: Date = new Date(),
    generatedFiles: string[] = GENERATED_PACKAGE_FILES,
): GameBuildInfo {
    const blueprintHash = crypto.createHash("sha256").update(JSON.stringify(blueprint)).digest("hex");

    return {
        schemaVersion: GAME_BLUEPRINT_SCHEMA_VERSION,
        generatedBy: "pokie build",
        pokieVersion,
        generatedAt: generatedAt.toISOString(),
        blueprintHash: `sha256:${blueprintHash}`,
        ...(sourcePath !== undefined ? {source: sourcePath} : {}),
        files: [...generatedFiles].sort(),
        game: blueprint.manifest,
    };
}
