// Bumped only if the GameBlueprint JSON shape itself changes in a way older tooling couldn't parse.
// Stamped into generated output (see GameBuildInfo) so a generated package records which shape of
// blueprint it was built from; it is not read back from blueprint JSON files.
export const GAME_BLUEPRINT_SCHEMA_VERSION = 1;

export type GameBlueprintManifest = {
    id: string;
    name: string;
    version: string;
    description?: string;
    author?: string;
};

// The minimal vertical-slice authoring format for "pokie build": reels/rows, symbols, paylines,
// paytable, and reel strips/weights for a standard line-pay video slot. Optional fields fall back
// to VideoSlotConfig's own defaults (horizontal paylines, the built-in weighted reel generator).
export type GameBlueprint = {
    manifest: GameBlueprintManifest;
    reels: number;
    rows: number;
    symbols: string[];
    wilds?: string[];
    scatters?: string[];
    // Row index (0-based, top row first) per reel. Line "0" spans row 0 across every reel, etc.
    // Omit to use VideoSlotConfig's default (one horizontal line per row).
    paylines?: number[][];
    // symbolId -> matchCount (as a string key, since JSON object keys are always strings) -> bet
    // multiplier, applied across every configured bet — see Paytable.setPayoutForSymbol.
    paytable: Record<string, Record<string, number>>;
    // One strip (an ordered array of symbol ids) per reel. Takes precedence over symbolWeights.
    reelStrips?: string[][];
    // symbolId -> relative count, applied uniformly (independently shuffled) to every reel.
    // Ignored when reelStrips is present. Omit both for the engine's built-in default weighting.
    symbolWeights?: Record<string, number>;
    availableBets?: number[];
};
