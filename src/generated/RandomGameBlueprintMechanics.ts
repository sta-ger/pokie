// Everything RandomGameBlueprintStrategy.build() contributes to the final GameBlueprint, alongside
// whatever manifest/naming RandomGameBlueprintGenerator adds on top.
export type RandomGameBlueprintMechanics = {
    reels: number;
    rows: number;
    symbols: string[];
    paytable: Record<string, Record<string, number>>;
    symbolWeights: Record<string, number>;
    availableBets: number[];
};
