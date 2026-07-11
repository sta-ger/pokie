import type {GameBlueprintManifest} from "./GameBlueprint.js";

// Provenance for a single "pokie build" run, written to src/generated/build-info.json alongside the
// generated game module so the output is inspectable (what produced it, from what, when) without
// reading the generator source. "schemaVersion" tracks the GameBlueprint JSON shape itself (see
// GAME_BLUEPRINT_SCHEMA_VERSION in GameBlueprint.ts), not this GameBuildInfo type.
//
// "files" doubles as a manifest: it's the exact set of paths (relative to the package root) that this
// run generated. A later "pokie build --out <dir>" into the same directory reads it back to decide
// whether re-running is a safe rebuild (every file it's about to write was itself produced by a prior
// "pokie build") or a conflict with something else already sitting there — see GamePackageGenerator.
export type GameBuildInfo = {
    schemaVersion: number;
    generatedBy: string;
    pokieVersion: string;
    generatedAt: string;
    blueprintHash: string;
    source?: string;
    files?: string[];
    game: GameBlueprintManifest;
};
