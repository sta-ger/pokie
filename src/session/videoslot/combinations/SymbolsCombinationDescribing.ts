import {BuildableFromMatrix, ConvertableToMatrix} from "pokie";

export interface SymbolsCombinationDescribing extends ConvertableToMatrix, BuildableFromMatrix {
    getSymbols(reelId: number): string[];
}
