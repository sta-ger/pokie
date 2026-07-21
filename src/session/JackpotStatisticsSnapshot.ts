// A plain-data, structured-cloneable snapshot of one jackpot pool's own cumulative simulation statistics —
// safe to send across a worker_threads boundary (see JackpotStatisticsProviding's own doc comment), unlike
// a live JackpotPoolRepresenting instance.
export type JackpotPoolStatisticsSnapshot = {
    readonly awardCount: number;
    readonly totalAwarded: number;
    readonly totalContributed: number;
};

// A plain-data snapshot of a session's own jackpot activity as of right now — "awardCount"/"totalAwarded"/
// "totalContributed" are the sum of every configured pool's own figures (see "pools"), kept alongside for
// convenience so a caller that doesn't care about per-pool/tier attribution doesn't have to fold "pools"
// itself. Deliberately plain data (no methods, no live pool references) so it can cross a worker_threads
// boundary and be merged via mergeJackpotStatisticsSnapshots (src/simulation/JackpotStatisticsMerging.ts)
// the same way SimulationAccumulatorSnapshot/SimulationBreakdownComponent already are.
export type JackpotStatisticsSnapshot = {
    readonly awardCount: number;
    readonly totalAwarded: number;
    readonly totalContributed: number;
    readonly pools: Readonly<Record<string, JackpotPoolStatisticsSnapshot>>;
};
