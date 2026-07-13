// Plain-data mirror of SimulationAccumulator's private running-totals state (see its toSnapshot()/
// fromSnapshot()) — the one thing that's safe to pass across a worker_threads boundary (a live
// SimulationAccumulator instance is not structured-cloneable in a meaningful way; this is). Exists
// purely so a merge step (see SimulationStatisticsMerger) can reconstruct a real SimulationAccumulator
// and reuse its own merge() — the online mean/variance algorithm itself is never duplicated.
export type SimulationAccumulatorSnapshot = {
    rounds: number;
    hitCount: number;
    totalBet: number;
    totalPayout: number;
    maxWin: number;
    meanPayout: number;
    meanSquareDelta: number;
    meanReturnRatio: number;
    meanReturnRatioSquareDelta: number;
    payoutHistogram: Record<string, number>;
};
