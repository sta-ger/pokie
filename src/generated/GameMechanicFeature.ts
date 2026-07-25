// The optional, mechanic-bearing areas of a GameBlueprint beyond the always-present reels/rows/
// symbols/paytable/symbolWeights baseline -- named here (rather than inferred from GameBlueprint's
// own keys) so a GameMechanicCompatibilityPolicy and a RandomGameBlueprintStrategy can both reason
// about "which extra mechanics would this add" without either depending on the other's internals.
export type GameMechanicFeature =
    | "wilds"
    | "scatters"
    | "paylines"
    | "winModel"
    | "mechanics"
    | "betModes"
    | "reelStrips"
    | "reelStripGeneration";

export const ALL_GAME_MECHANIC_FEATURES: readonly GameMechanicFeature[] = [
    "wilds",
    "scatters",
    "paylines",
    "winModel",
    "mechanics",
    "betModes",
    "reelStrips",
    "reelStripGeneration",
];
