import {
    ClusterWinCalculating,
    SymbolsCombinationDescribing,
    SymbolsCombinationsAnalyzer,
    VideoSlotConfigDescribing,
    WinningCluster,
    WinningClusterDescribing,
} from "pokie";

// Pay-anywhere-by-adjacency win style used by cluster-pay slots: unlike LineWinCalculator
// (fixed paylines) or ScatterWinCalculator (counts a symbol anywhere on the grid, no
// adjacency requirement), this groups orthogonally-adjacent same-symbol cells (4-directional flood
// fill across the reel/row grid) and pays each group that reaches the minimum cluster size on its
// own. A grid can contain several separate clusters of the same symbol, so results are keyed by a
// generated cluster index rather than by symbolId (mirrors how winningLines are keyed by lineId).
export class ClusterWinCalculator<T extends string | number | symbol = string> implements ClusterWinCalculating<T> {
    private readonly config: VideoSlotConfigDescribing<T>;
    private readonly minimumClusterSize: number;

    constructor(config: VideoSlotConfigDescribing<T>, minimumClusterSize = 5) {
        this.config = config;
        this.minimumClusterSize = minimumClusterSize;
    }

    public calculateWinningClusters(
        bet: number,
        symbolsCombination: SymbolsCombinationDescribing<T>,
    ): Record<string, WinningClusterDescribing<T>> {
        const winningClusters: Record<string, WinningClusterDescribing<T>> = {};
        const clusters = SymbolsCombinationsAnalyzer.getSymbolsClusters<T>(
            symbolsCombination.toMatrix(),
            this.minimumClusterSize,
            this.config.getWildSymbols(),
            this.config.getWildSubstitutions?.(),
        );
        clusters.forEach((cluster, index) => {
            const winAmount = this.getWinAmountForSymbol(bet, cluster.symbolId, cluster.positions.length);
            if (winAmount > 0) {
                winningClusters[index] = new WinningCluster<T>(cluster.symbolId, cluster.positions, winAmount);
            }
        });
        return winningClusters;
    }

    private getWinAmountForSymbol(bet: number, symbolId: T, clusterSize: number): number {
        return this.config.getPaytable().getWinAmountForSymbol(symbolId, clusterSize, bet);
    }
}
