import {SymbolsCombinationsAnalyzer} from "./SymbolsCombinationsAnalyzer.js";

export class ClusterDetector {
    public detect<T extends string | number | symbol = string>(
        symbols: T[][],
        minimumClusterSize: number,
        wildSymbols?: T[],
        wildSubstitutions?: Partial<Record<T, T[]>>,
    ): {symbolId: T; positions: number[][]}[] {
        return SymbolsCombinationsAnalyzer.getSymbolsClusters(symbols, minimumClusterSize, wildSymbols, wildSubstitutions);
    }
}
