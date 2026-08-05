import type {GameBlueprintManifest} from "./GameBlueprint.js";
import type {GameBuildInfoReelStripGeneration} from "./GameBuildInfoReelStripGeneration.js";

// Provenance for a single "pokie build" run — computed by buildGameBuildInfo() and returned as an
// in-memory result (BuildCommand's console summary/--dry-run preview, Studio's build API DTOs), never
// persisted into the built package itself: a built package carries no blueprint/build-info metadata of
// its own (see GamePackageGenerator's own doc comment) — this type only describes what a *caller*
// computed, not something read back from disk. "schemaVersion" tracks the GameBlueprint JSON shape
// itself (see GAME_BLUEPRINT_SCHEMA_VERSION in GameBlueprint.ts), not this GameBuildInfo type.
export type GameBuildInfo = {
    schemaVersion: number;
    generatedBy: string;
    pokieVersion: string;
    generatedAt: string;
    blueprintHash: string;
    source?: string;
    files?: string[];
    game: GameBlueprintManifest;
    // Present only when the blueprint used reelStripGeneration: the original config that drove it
    // (including its seed) plus what actually happened per reel. Absent for literal reelStrips.
    reelStripGeneration?: GameBuildInfoReelStripGeneration;
};
