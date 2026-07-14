import type {PokieGameManifest} from "../gamepackage/PokieGameManifest.js";

// What produced a RoundArtifact: which game (reuses PokieGameManifest rather than duplicating
// id/name/version), which pokie release, and — when the game was generated via "pokie build" — the
// GameBlueprint hash (see computeBlueprintHash) it was built from, so an artifact can be traced back to the
// exact config that produced it.
export type RoundArtifactProvenance = {
    readonly game: Readonly<PokieGameManifest>;
    readonly pokieVersion: string;
    readonly configHash?: string;
};
