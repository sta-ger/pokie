import type {ReelStripAnalysis} from "../reels/ReelStripAnalysis.js";
import type {ReelStripGenerationDiagnostic} from "../reels/ReelStripGenerationDiagnostic.js";
import type {ReelStripSymbolWeightsConversionDiagnostic} from "../reels/ReelStripSymbolWeightsConversionDiagnostic.js";

// A canonical read model for a project's own GameBlueprint (see buildGameModelProjection.ts for how
// this is computed) -- every section is either "available" (the underlying GameBlueprint really has this
// data, however empty) or "unavailable" (no blueprint was available to project at all, with `reason`
// explaining exactly why), so a caller never has to flatten a paytable, infer a reel generation mode, or
// otherwise re-derive any of this from a raw blueprint record itself; it only ever renders what this
// projection already says.
export type GameModelSection<T> = {status: "available"; data: T} | {status: "unavailable"; reason: string};

export type GameModelBasics = {id?: string; name?: string; version?: string; description?: string; author?: string};

export type GameModelWinModel = {type: "lines" | "ways" | "clusters"; minimumClusterSize?: number};

// `paylineCount` is only meaningful for the "lines" win model (paylines are ignored otherwise -- see
// GameBlueprintWinModel's own doc comment) -- omitted for "ways"/"clusters" rather than reporting a
// possibly-misleading 0.
export type GameModelLayout = {reels?: number; rows?: number; winModel: GameModelWinModel; paylineCount?: number};

export type GameModelSymbol = {id: string; isWild: boolean; isScatter: boolean};

export type GameModelReelGenerationMode = "reelStrips" | "reelStripGeneration" | "symbolWeights" | "default";

export type GameModelReelWindowCell = {symbolId: string; isWild: boolean; isScatter: boolean};

// The Game window: this project's own reel grid, in the same [reelIndex][rowIndex] orientation every
// other screen in Pokie already uses (SymbolsCombination.toMatrix, RoundArtifact.screen, ScreenTable, ...).
// `grid` is always read off whichever strip each reel actually resolves to at stop position 0 -- its real
// fixed strip for "reelStrips"/"reelStripGeneration" (see GameModelReels.reels), or its reproducible sample
// strip for "symbolWeights"/"default" (see GameModelReels.sharedWeightsSample) -- never an invented grid.
// `wrapsAround` is always true: every reel strip in this engine is a circular sequence (see
// ReelStrip.getSymbolAt), so a stop near a strip's own end always wraps back to its start.
export type GameModelGameWindow = {reels: number; rows: number; wrapsAround: true; grid: GameModelReelWindowCell[][]};

// One position on a reel's own resolved strip -- `locked` is only ever true for a "generated" reel whose
// own reelStripGeneration entry pins that position via lockedPositions; `stackSize` is this position's own
// run length within a run of 2+ identical adjacent symbols (1 for a position that isn't part of one),
// computed via SymbolsSequence.getSymbolsStacksIndexes -- the same, already-tested circular-run detection
// the engine's own default reel builder relies on, never re-derived by hand here.
export type GameModelReelStripPosition = {
    index: number;
    symbolId: string;
    isWild: boolean;
    isScatter: boolean;
    locked: boolean;
    stackSize: number;
};

// One physical reel's own full strip, plus its own ReelStripAnalyzer.analyze() output -- the exact same
// counts/shares/distances diagnostics "pokie build" itself would compute, never re-derived here.
// `source: "sample"` means this reel has no fixed strip at all (see GameModelReels.sharedWeightsSample's
// own doc comment) -- its positions are one reproducible, clearly-labeled instantiation of the shared
// weights, not the strip any real session will actually play. `generationDiagnostics` (one entry per
// generation attempt) is only ever populated for a "generated" reel.
export type GameModelResolvedReel = {
    reelIndex: number;
    source: "literal" | "generated" | "sample";
    positions: GameModelReelStripPosition[];
    analysis: ReelStripAnalysis;
    generationDiagnostics?: ReelStripGenerationDiagnostic[];
};

// A "generated" reel whose own reelStripGeneration constraints couldn't be satisfied -- mirrors what a
// real "pokie build" would report for the same blueprint (see resolveReelStripGeneration.ts); there is no
// strip to show, only why generation failed.
export type GameModelUnresolvedReel = {reelIndex: number; source: "generated"; reason: string; generationDiagnostics: ReelStripGenerationDiagnostic[]};

export type GameModelReel = GameModelResolvedReel | GameModelUnresolvedReel;

// A reproducible sample for a generation mode whose real strip is reshuffled fresh via Math.random() on
// every session/build ("symbolWeights" and the engine's own built-in "default" weighting both work this
// way -- see VideoSlotConfig.setAvailableSymbols / ReelsSymbolsSequencesGenerator, neither of which is
// seedable), so there is no single "the" strip to show truthfully. `conversion` is the real weights ->
// counts apportionment ReelStripGenerator.generateFromSymbolWeights() itself computed for this sample
// (LargestRemainderReelStripSymbolWeightsConverter's own diagnostic: counts, target/actual proportions,
// deviations) -- the "conversion action" behind the sample, not a separate re-derivation. `seed` is
// arbitrary but fixed purely so the same blueprint always previews the same sample in Studio; it is never
// the seed any real session actually uses.
export type GameModelSharedWeightsSample = {weights: Record<string, number>; seed: number; sampleLength: number; conversion: ReelStripSymbolWeightsConversionDiagnostic};

// `reels`/`gameWindow` are always populated (one entry per physical reel, "literal"/"generated" for
// "reelStrips"/"reelStripGeneration", "sample" for "symbolWeights"/"default") -- see GameModelReel's own
// doc comment for what distinguishes a real strip from a reproducible sample. `sharedWeightsSample` is
// only ever populated alongside "symbolWeights"/"default" reels.
export type GameModelReels = {
    generationMode: GameModelReelGenerationMode;
    gameWindow: GameModelGameWindow;
    reels: GameModelReel[];
    sharedWeightsSample?: GameModelSharedWeightsSample;
};

export type GameModelPaytableRow = {symbolId: string; matchCount: number; payout: number};

export type GameModelBetMode = {id: string; label?: string; costMultiplier?: number; targetRtp?: number};

export type GameModelBetsAndModes = {availableBets: number[]; betModes: GameModelBetMode[]};

export type GameModelFreeGames = {scatterSymbol: string; awardsByCount: Record<string, number>};

export type GameModelMechanics = {freeGames?: GameModelFreeGames};

// The bet range this project's own blueprint actually declares -- both fields are the plain min/max of
// `betsAndModes.data.availableBets`, never a separately-authored/invented limit; omitted (not 0) when
// availableBets itself is empty, the same "never report a possibly-misleading number" convention
// GameModelLayout.paylineCount already follows.
export type GameModelLimits = {minBet?: number; maxBet?: number};

export type GameModelProjection = {
    basics: GameModelSection<GameModelBasics>;
    layout: GameModelSection<GameModelLayout>;
    symbols: GameModelSection<GameModelSymbol[]>;
    reels: GameModelSection<GameModelReels>;
    paytable: GameModelSection<GameModelPaytableRow[]>;
    betsAndModes: GameModelSection<GameModelBetsAndModes>;
    mechanics: GameModelSection<GameModelMechanics>;
    limits: GameModelSection<GameModelLimits>;
};
