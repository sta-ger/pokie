import {
    WinAmountDetermining,
    WinningClusterDescribing,
    WinningLineDescribing,
    WinningScatterDescribing,
    WinningValueDescribing,
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

    // Optional for the same reason. Per-symbol bet-multiplier values (each occurrence contributes
    // independently, no count-tiered payout lookup) are opt-in via a ValueWinCalculating
    // implementation, e.g. DefaultValueWinCalculator.
    getWinningValues?(): Record<T, WinningValueDescribing<T>>;

    getValuesWinning?(): number;
}
