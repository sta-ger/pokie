import {SymbolsCombinationsAnalyzer} from "./SymbolsCombinationsAnalyzer.js";

export class SymbolOverlayTransformer {
    public overlay<T extends string | number | symbol = string>(
        symbols: T[][],
        overrides: {position: number[]; symbolId: T}[],
    ): T[][] {
        return SymbolsCombinationsAnalyzer.overlaySymbols(symbols, overrides);
    }
}
