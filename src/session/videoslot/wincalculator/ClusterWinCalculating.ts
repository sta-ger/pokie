import {SymbolsCombinationDescribing, WinningClusterDescribing} from "pokie";

export interface ClusterWinCalculating<T extends string | number | symbol = string> {
    calculateWinningClusters(
        bet: number,
        symbolsCombination: SymbolsCombinationDescribing<T>,
    ): Record<string, WinningClusterDescribing<T>>;
}
