import {computeGameBlueprintHash} from "./computeGameBlueprintHash.js";
import {GAME_BLUEPRINT_SCHEMA_VERSION, type GameBlueprint} from "./GameBlueprint.js";
import type {GameBuildInfo} from "./GameBuildInfo.js";
import type {GameBuildInfoReelStripGeneration} from "./GameBuildInfoReelStripGeneration.js";

// The fixed set of paths (relative to the package root) that GamePackageGenerator writes on every
// run. Also the default for buildGameBuildInfo's "generatedFiles" param, and GamePackageGenerator's
// fallback when an existing build-info.json predates the "files" field.
export const GENERATED_PACKAGE_FILES = ["package.json", "README.md", "src/generated/index.js", "src/generated/build-info.json"];

// Hashes the blueprint exactly as loaded (same object that gets embedded into the generated module),
// so re-running "pokie build" on an unchanged blueprint reproduces the same hash — a cheap way to tell
// "regenerated, nothing changed" apart from "regenerated, blueprint changed" without diffing JSON.
//
// "previous" is the prior run's own build-info.json (when rebuilding into an existing package). When
// its blueprintHash/pokieVersion/source all still match this run, that means nothing that build-info.json
// exists to describe has actually changed — so its "generatedAt" is reused verbatim instead of stamped
// with "now". Without this, build-info.json (and only build-info.json; index.js already special-cases
// this — see renderGeneratedGameModule) would show a spurious diff on every no-op rebuild.
export function buildGameBuildInfo(
    blueprint: GameBlueprint,
    pokieVersion: string,
    sourcePath?: string,
    generatedAt: Date = new Date(),
    generatedFiles: string[] = GENERATED_PACKAGE_FILES,
    previous: GameBuildInfo | undefined = undefined,
    reelStripGeneration: GameBuildInfoReelStripGeneration | undefined = undefined,
): GameBuildInfo {
    const blueprintHash = computeGameBlueprintHash(blueprint);

    const isNoOpRebuild =
        previous !== undefined &&
        previous.blueprintHash === blueprintHash &&
        previous.pokieVersion === pokieVersion &&
        previous.source === sourcePath;

    return {
        schemaVersion: GAME_BLUEPRINT_SCHEMA_VERSION,
        generatedBy: "pokie build",
        pokieVersion,
        generatedAt: isNoOpRebuild ? previous.generatedAt : generatedAt.toISOString(),
        blueprintHash,
        ...(sourcePath !== undefined ? {source: sourcePath} : {}),
        files: [...generatedFiles].sort(),
        game: blueprint.manifest,
        ...(reelStripGeneration !== undefined ? {reelStripGeneration} : {}),
    };
}
