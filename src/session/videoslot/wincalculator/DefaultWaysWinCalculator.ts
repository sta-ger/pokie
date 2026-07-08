import {
    SymbolsCombinationDescribing,
    SymbolsCombinationsAnalyzer,
    VideoSlotConfigDescribing,
    WaysWinCalculating,
    WinningWay,
    WinningWayDescribing,
} from "pokie";

// Multiplicative ways-to-win (243-ways/Megaways style): for every payable symbol, pays
// paytable(symbolId, reelsMatched, bet) * waysCount, where waysCount is the product of how many
// matching cells sit in each consecutive reel from the left (see
// SymbolsCombinationsAnalyzer.getWaysForSymbol). Distinct from DefaultLineWinCalculator, which
// checks fixed row-combinations one at a time and never surfaces a ways count.
export class DefaultWaysWinCalculator<T extends string | number | symbol = string> implements WaysWinCalculating<T> {
    private readonly config: VideoSlotConfigDescribing<T>;

    constructor(config: VideoSlotConfigDescribing<T>) {
        this.config = config;
    }

    public calculateWinningWays(
        bet: number,
        symbolsCombination: SymbolsCombinationDescribing<T>,
    ): Record<T, WinningWayDescribing<T>> {
        const winningWays = {} as Record<T, WinningWayDescribing<T>>;
        const matrix = symbolsCombination.toMatrix();
        const payableSymbols = this.config
            .getAvailableSymbols()
            .filter(
                (symbolId) =>
                    !this.config.isSymbolWild(symbolId) &&
                    !this.config.getScatterSymbols().some((scatter) => scatter === symbolId),
            );

        payableSymbols.forEach((symbolId) => {
            const {reelsMatched, waysCount, positions} = SymbolsCombinationsAnalyzer.getWaysForSymbol<T>(
                matrix,
                symbolId,
                this.config.getWildSymbols(),
                this.config.getWildSubstitutions?.(),
            );
            if (reelsMatched > 0) {
                const winAmount = this.config.getPaytable().getWinAmountForSymbol(symbolId, reelsMatched, bet) * waysCount;
                if (winAmount > 0) {
                    winningWays[symbolId] = new WinningWay<T>(symbolId, positions, waysCount, winAmount);
                }
            }
        });
        return winningWays;
    }
}
