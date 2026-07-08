import {
    ScatterWinCalculating,
    SymbolsCombinationDescribing,
    SymbolsCombinationsAnalyzer,
    VideoSlotConfigDescribing,
    WinningScatter,
    WinningScatterDescribing,
} from "pokie";

export class ScatterWinCalculator<T extends string | number | symbol = string> implements ScatterWinCalculating<T> {
    private readonly config: VideoSlotConfigDescribing<T>;

    constructor(config: VideoSlotConfigDescribing<T>) {
        this.config = config;
    }

    public calculateWinningScatters(
        bet: number,
        symbolsCombination: SymbolsCombinationDescribing<T>,
    ): Record<T, WinningScatterDescribing<T>> {
        const winningScatters = {} as Record<T, WinningScatterDescribing<T>>;
        if (this.config.getScatterSymbols() !== null) {
            for (const scatter of this.config.getScatterSymbols()) {
                const curScatterSymbolId = scatter;
                const curScatterSymbolsPositions = SymbolsCombinationsAnalyzer.getScatterSymbolsPositions<T>(
                    symbolsCombination.toMatrix(),
                    curScatterSymbolId,
                );
                const winAmount = this.getWinAmountForSymbol(bet, curScatterSymbolId, curScatterSymbolsPositions.length);
                if (winAmount > 0) {
                    winningScatters[curScatterSymbolId] = new WinningScatter<T>(
                        curScatterSymbolId,
                        curScatterSymbolsPositions,
                        winAmount,
                    );
                }
            }
        }
        return winningScatters;
    }

    private getWinAmountForSymbol(bet: number, symbolId: T, numOfWinningSymbols: number): number {
        return this.config.getPaytable().getWinAmountForSymbol(symbolId, numOfWinningSymbols, bet);
    }
}
