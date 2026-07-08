import {
    SymbolsCombinationDescribing,
    SymbolsCombinationsAnalyzer,
    ValueWinCalculating,
    WinningValue,
    WinningValueDescribing,
} from "pokie";

// A distinct win shape from lines/scatters/clusters: some symbols carry their own bet-multiplier
// value (e.g. differently-weighted variants of the same conceptual symbol, each worth a different
// amount), and every occurrence on the grid contributes that value independently — there's no
// count-tiered payout lookup, the win is simply (occurrences found) * (value of that symbol) * bet.
export class DefaultValueWinCalculator<T extends string | number | symbol = string> implements ValueWinCalculating<T> {
    private readonly symbolValues: Partial<Record<T, number>>;

    constructor(symbolValues: Partial<Record<T, number>>) {
        this.symbolValues = symbolValues;
    }

    public calculateWinningValues(
        bet: number,
        symbolsCombination: SymbolsCombinationDescribing<T>,
    ): Record<T, WinningValueDescribing<T>> {
        const winningValues = {} as Record<T, WinningValueDescribing<T>>;
        const matrix = symbolsCombination.toMatrix();
        // Record keys always come back as strings from `for...in`, even when T is numeric — the
        // underlying property lookup below still works because JS coerces numeric-looking keys
        // transparently, so casting the key back to T here is safe.
        for (const symbolId in this.symbolValues) {
            if (this.symbolValues[symbolId]) {
                const valuePerSymbol = this.symbolValues[symbolId] as number;
                const positions = SymbolsCombinationsAnalyzer.getScatterSymbolsPositions<T>(matrix, symbolId as T);
                if (positions.length > 0) {
                    winningValues[symbolId] = new WinningValue<T>(
                        symbolId as T,
                        positions,
                        positions.length * valuePerSymbol * bet,
                    );
                }
            }
        }
        return winningValues;
    }
}
