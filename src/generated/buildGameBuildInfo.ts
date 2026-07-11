import crypto from "crypto";
import {GAME_BLUEPRINT_SCHEMA_VERSION, type GameBlueprint} from "./GameBlueprint.js";
import type {GameBuildInfo} from "./GameBuildInfo.js";

// Hashes the blueprint exactly as loaded (same object that gets embedded into the generated module),
// so re-running "pokie build" on an unchanged blueprint reproduces the same hash — a cheap way to tell
// "regenerated, nothing changed" apart from "regenerated, blueprint changed" without diffing JSON.
export function buildGameBuildInfo(blueprint: GameBlueprint, pokieVersion: string, sourcePath?: string, generatedAt: Date = new Date()): GameBuildInfo {
    const blueprintHash = crypto.createHash("sha256").update(JSON.stringify(blueprint)).digest("hex");

    return {
        schemaVersion: GAME_BLUEPRINT_SCHEMA_VERSION,
        generatedBy: "pokie build",
        pokieVersion,
        generatedAt: generatedAt.toISOString(),
        blueprintHash: `sha256:${blueprintHash}`,
        ...(sourcePath !== undefined ? {source: sourcePath} : {}),
        game: blueprint.manifest,
    };
}
