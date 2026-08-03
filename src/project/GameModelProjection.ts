// The canonical, server/core-owned read model for POKIE Studio's Game Model tab (see
// buildGameModelProjection.ts for how this is computed and cli/studio-client's own GameModelView.tsx for
// the one place it's rendered) -- every section is either "available" (this project's own tracked source
// GameBlueprint really has this data, however empty) or "unavailable" (this project's introspection is
// only partial -- no tracked source recorded, a load failure, ... -- with `reason` explaining exactly
// why), so a caller never has to flatten a paytable, infer a reel generation mode, or otherwise re-derive
// any of this from a raw blueprint record itself; it only ever renders what this projection already says.
export type GameModelSection<T> = {status: "available"; data: T} | {status: "unavailable"; reason: string};

export type GameModelBasics = {id?: string; name?: string; version?: string; description?: string; author?: string};

export type GameModelWinModel = {type: "lines" | "ways" | "clusters"; minimumClusterSize?: number};

// `paylineCount` is only meaningful for the "lines" win model (paylines are ignored otherwise -- see
// GameBlueprintWinModel's own doc comment) -- omitted for "ways"/"clusters" rather than reporting a
// possibly-misleading 0.
export type GameModelLayout = {reels?: number; rows?: number; winModel: GameModelWinModel; paylineCount?: number};

export type GameModelSymbol = {id: string; isWild: boolean; isScatter: boolean};

export type GameModelReelGenerationMode = "reelStrips" | "reelStripGeneration" | "symbolWeights" | "default";

export type GameModelReels = {generationMode: GameModelReelGenerationMode};

export type GameModelPaytableRow = {symbolId: string; matchCount: number; payout: number};

export type GameModelBetMode = {id: string; label?: string; costMultiplier?: number; targetRtp?: number};

export type GameModelBetsAndModes = {availableBets: number[]; betModes: GameModelBetMode[]};

export type GameModelFreeGames = {scatterSymbol: string; awardsByCount: Record<string, number>};

export type GameModelMechanics = {freeGames?: GameModelFreeGames};

export type GameModelProjection = {
    basics: GameModelSection<GameModelBasics>;
    layout: GameModelSection<GameModelLayout>;
    symbols: GameModelSection<GameModelSymbol[]>;
    reels: GameModelSection<GameModelReels>;
    paytable: GameModelSection<GameModelPaytableRow[]>;
    betsAndModes: GameModelSection<GameModelBetsAndModes>;
    mechanics: GameModelSection<GameModelMechanics>;
};
