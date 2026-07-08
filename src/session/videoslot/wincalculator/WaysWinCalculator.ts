import {
    SymbolsCombinationDescribing,
    VideoSlotConfigDescribing,
    WaysAnalyzer,
    WaysWinCalculating,
    WinningWay,
    WinningWayDescribing,
} from "pokie";

// Multiplicative ways-to-win (243-ways-style) evaluation: for every payable symbol, pays
// paytable(symbolId, reelsMatched, bet) * waysCount, where waysCount is the product of how many
// matching cells sit in each consecutive reel from the left (see
// SymbolsCombinationsAnalyzer.getWaysForSymbol). Distinct from LineWinCalculator, which checks
// fixed row-combinations one at a time and never surfaces a ways count.
export class WaysWinCalculator<T extends string | number | symbol = string> implements WaysWinCalculating<T> {
    private readonly config: VideoSlotConfigDescribing<T>;
    private readonly waysAnalyzer: WaysAnalyzer;

    constructor(config: VideoSlotConfigDescribing<T>, waysAnalyzer: WaysAnalyzer = new WaysAnalyzer()) {
        this.config = config;
        this.waysAnalyzer = waysAnalyzer;
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
            const {reelsMatched, waysCount, positions} = this.waysAnalyzer.analyzeForSymbol<T>(
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
