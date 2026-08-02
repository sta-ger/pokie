import {computeGameBlueprintHash} from "./computeGameBlueprintHash.js";
import {GAME_BLUEPRINT_SCHEMA_VERSION, type GameBlueprint} from "./GameBlueprint.js";
import type {GameBuildInfo} from "./GameBuildInfo.js";
import type {GameBuildInfoReelStripGeneration} from "./GameBuildInfoReelStripGeneration.js";

// The fixed set of paths (relative to the package root) that GamePackageGenerator writes on every
// run — the exact same canonical package file set "pokie create"/"pokie init" produce via
// GamePackagePreparer's own create -> install -> build -> verify lifecycle (see the shared
// buildPackageJsonPatch/renderTsconfig in src/gamepackage), just written directly rather than
// requiring a real "npm install"/"npm run build" for the output to already be immediately usable —
// see GamePackageGenerator's own doc comment. Also the default for buildGameBuildInfo's own
// "generatedFiles" param.
export const BUILT_PACKAGE_FILES = ["package.json", "package-lock.json", "tsconfig.json", "README.md", "src/index.ts", "dist/index.js"];

// Computes provenance for a would-be/just-run "pokie build" — a pure, in-memory result (see
// GameBuildInfo's own doc comment for why this is never itself persisted into the built package).
// Hashes the blueprint exactly as loaded (the same object that gets embedded into the generated
// module), so building an unchanged blueprint always reproduces the same hash — a cheap way to tell
// "nothing changed" apart from "blueprint changed" without diffing JSON.
export function buildGameBuildInfo(
    blueprint: GameBlueprint,
    pokieVersion: string,
    sourcePath?: string,
    generatedAt: Date = new Date(),
    generatedFiles: string[] = BUILT_PACKAGE_FILES,
    reelStripGeneration: GameBuildInfoReelStripGeneration | undefined = undefined,
): GameBuildInfo {
    return {
        schemaVersion: GAME_BLUEPRINT_SCHEMA_VERSION,
        generatedBy: "pokie build",
        pokieVersion,
        generatedAt: generatedAt.toISOString(),
        blueprintHash: computeGameBlueprintHash(blueprint),
        ...(sourcePath !== undefined ? {source: sourcePath} : {}),
        files: [...generatedFiles].sort(),
        game: blueprint.manifest,
        ...(reelStripGeneration !== undefined ? {reelStripGeneration} : {}),
    };
}
