import type {SymbolsCombinationDescribing} from "../combinations/SymbolsCombinationDescribing.js";
import type {WinningClusterDescribing} from "../WinningClusterDescribing.js";

export interface ClusterWinCalculating<T extends string | number | symbol = string> {
    calculateWinningClusters(
        bet: number,
        symbolsCombination: SymbolsCombinationDescribing<T>,
    ): Record<string, WinningClusterDescribing<T>>;
}
