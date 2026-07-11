import type {GameBlueprintManifest} from "./GameBlueprint.js";

// Provenance for a single "pokie build" run, written to src/generated/build-info.json alongside the
// generated game module so the output is inspectable (what produced it, from what, when) without
// reading the generator source. "schemaVersion" tracks the GameBlueprint JSON shape itself (see
// GAME_BLUEPRINT_SCHEMA_VERSION in GameBlueprint.ts), not this GameBuildInfo type.
export type GameBuildInfo = {
    schemaVersion: number;
    generatedBy: string;
    pokieVersion: string;
    generatedAt: string;
    blueprintHash: string;
    source?: string;
    game: GameBlueprintManifest;
};
