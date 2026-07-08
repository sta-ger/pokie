import {SymbolsCombinationsAnalyzer} from "./SymbolsCombinationsAnalyzer.js";

export class GridAnalyzer {
    public getScatterPositions<T extends string | number | symbol = string>(symbols: T[][], scatterSymbolId: T): number[][] {
        return SymbolsCombinationsAnalyzer.getScatterSymbolsPositions(symbols, scatterSymbolId);
    }

    public getSymbolsCount<T extends string | number | symbol = string>(symbols: T[][], symbolId: T): number {
        return SymbolsCombinationsAnalyzer.getSymbolsCount(symbols, symbolId);
    }

    public getSymbolsFrequency<T extends string | number | symbol = string>(symbols: T[][]): Record<T, number> {
        return SymbolsCombinationsAnalyzer.getSymbolsFrequency(symbols);
    }
}
