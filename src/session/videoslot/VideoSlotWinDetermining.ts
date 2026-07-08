import {
    WinAmountDetermining,
    WinningClusterDescribing,
    WinningLineDescribing,
    WinningScatterDescribing,
} from "pokie";

export interface VideoSlotWinDetermining<T extends string | number | symbol = string> extends WinAmountDetermining {
    getWinningLines(): Record<string, WinningLineDescribing<T>>;

    getWinningScatters(): Record<T, WinningScatterDescribing<T>>;

    getLinesWinning(): number;

    getScattersWinning(): number;

    // Optional so existing implementers of this interface (VideoSlotSession, custom
    // VideoSlotWinCalculating implementations, etc.) keep compiling unchanged. Cluster-pay wins
    // (adjacent same-symbol groups anywhere on the grid) are opt-in via a ClusterWinCalculating
    // implementation, e.g. DefaultClusterWinCalculator.
    getWinningClusters?(): Record<string, WinningClusterDescribing<T>>;

    getClustersWinning?(): number;
}
