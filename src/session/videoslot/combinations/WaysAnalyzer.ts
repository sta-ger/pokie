import {SymbolsCombinationsAnalyzer} from "./SymbolsCombinationsAnalyzer.js";

export class WaysAnalyzer {
    public analyzeForSymbol<T extends string | number | symbol = string>(
        symbols: T[][],
        symbolId: T,
        wildSymbols?: T[],
        wildSubstitutions?: Partial<Record<T, T[]>>,
    ): {reelsMatched: number; waysCount: number; positions: number[][]} {
        return SymbolsCombinationsAnalyzer.getWaysForSymbol(symbols, symbolId, wildSymbols, wildSubstitutions);
    }
}
