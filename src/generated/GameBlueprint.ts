import type {BetMode} from "../gamepackage/BetMode.js";
import type {ReelStripGenerationSpec} from "./ReelStripGenerationSpec.js";

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

// How wins are evaluated. Omit (or {type: "lines"}) for today's default: paylines + Paytable, via
// VideoSlotConfig's own default win calculator -- unchanged behavior for every existing blueprint.
// "ways"/"clusters" opt into WaysWinCalculator/ClusterWinCalculator (see GamePackageGenerator);
// "paylines" is ignored (a validator warning, not an error) when either is chosen.
export type GameBlueprintWinModel =
    | {type: "lines"}
    | {type: "ways"}
    | {type: "clusters"; minimumClusterSize?: number};

// One scatter-triggered free games award. "scatterSymbol" must be one of blueprint.scatters.
// "awardsByCount" mirrors paytable's shape: matchCount (as a string key) -> free games awarded.
export type GameBlueprintFreeGames = {
    scatterSymbol: string;
    awardsByCount: Record<string, number>;
};

export type GameBlueprintMechanics = {
    freeGames?: GameBlueprintFreeGames;
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
    // One strip (an ordered array of symbol ids) per reel. Takes precedence over reelStripGeneration
    // and symbolWeights. Unchanged since before reelStripGeneration existed.
    reelStrips?: string[][];
    // Per-reel build-time alternative to a literal reelStrips: one entry per reel (must have exactly
    // "reels" entries), each independently either {type: "literal", strip} — the same data a
    // reelStrips entry would hold — or {type: "generated", ...} — that reel's own, fully independent
    // ReelStripGenerationConfig, run through the existing ReelStripGenerator (see
    // resolveReelStripGeneration.ts). Literal and generated reels freely mix within one blueprint.
    // Mutually exclusive with reelStrips (an error if both are set); takes precedence over
    // symbolWeights. The generated package stores the resulting exact strips as plain reelStrips —
    // the runtime game module never depends on the generation API.
    reelStripGeneration?: ReelStripGenerationSpec[];
    // symbolId -> relative count, applied uniformly (independently shuffled) to every reel. Ignored
    // when reelStrips or reelStripGeneration is present. Omit all three for the engine's built-in
    // default weighting.
    symbolWeights?: Record<string, number>;
    availableBets?: number[];
    winModel?: GameBlueprintWinModel;
    mechanics?: GameBlueprintMechanics;
    // Selectable bet modes (e.g. base game, buy-the-feature). Purely declarative: the generated
    // module exposes these via the optional PokieGame.getBetModes(), but nothing in the engine ever
    // auto-selects one -- see BetMode's own doc comment.
    betModes?: BetMode[];
};
