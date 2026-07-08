import {SymbolsCombinationsAnalyzer} from "./SymbolsCombinationsAnalyzer.js";

export class CascadeGridTransformer {
    public collapseAndRefill<T extends string | number | symbol = string>(
        symbols: T[][],
        positionsToRemove: number[][],
        refillSymbolsPerReel: T[][],
    ): T[][] {
        return SymbolsCombinationsAnalyzer.collapseAndRefillSymbols(symbols, positionsToRemove, refillSymbolsPerReel);
    }
}
