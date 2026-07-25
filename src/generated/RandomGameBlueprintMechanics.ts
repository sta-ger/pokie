import type {GameBlueprintWinModel} from "./GameBlueprint.js";

// Everything RandomGameBlueprintStrategy.build() contributes to the final GameBlueprint, alongside
// whatever manifest/naming RandomGameBlueprintGenerator adds on top. "symbolWeights"/"reelStrips"/
// "paylines"/"winModel" are optional (rather than symbolWeights being required, as before) so a
// strategy can populate whichever of these areas its declared GameMechanicFeature set actually covers
// -- see RandomGameBlueprintStrategy.features and GameMechanicCompatibilityCatalog for what
// combinations are safe to mix on one blueprint.
export type RandomGameBlueprintMechanics = {
    reels: number;
    rows: number;
    symbols: string[];
    paytable: Record<string, Record<string, number>>;
    symbolWeights?: Record<string, number>;
    reelStrips?: string[][];
    paylines?: number[][];
    winModel?: GameBlueprintWinModel;
    availableBets: number[];
};
