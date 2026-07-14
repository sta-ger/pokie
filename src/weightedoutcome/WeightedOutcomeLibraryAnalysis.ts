// One point of the exact payout distribution: the weighted probability (share of total weight, summing to 1
// across every bucket) of an outcome whose artifact.payoutMultiplier equals exactly this value — an exact
// probability mass function, not a Monte Carlo histogram, so distinct multiplier values are never binned
// together the way SimulationAccumulator's payoutHistogram buckets raw payouts into ranges.
export type WeightedOutcomePayoutBucket = {
    readonly payoutMultiplier: number;
    readonly probability: number;
};

// The exact statistics WeightedOutcomeLibraryAnalyzer computes over a WeightedOutcomeLibrary — no sampling, no
// confidence interval, because the library already enumerates every possible outcome with its exact weight.
// "rtp"/"variance"/"standardDeviation" are all defined over each outcome's own artifact.payoutMultiplier (a
// stake-normalized return ratio), the same way SimulationStatistics.rtp is the mean of per-round payout/bet
// ratios rather than totalPayout/totalBet — this stays correct even when outcomes mix different stakes (e.g.
// base-game spins alongside zero-stake free-games outcomes). "maxWin"/"maxWinProbability" are the one exception:
// they're the raw currency totalWin (matching SimulationStatistics.maxWin's own meaning), since "the biggest win
// this library can produce" is a statement about actual payout, not a normalized ratio.
export type WeightedOutcomeLibraryAnalysis = {
    readonly totalWeight: number;
    readonly rtp: number;
    readonly hitFrequency: number;
    readonly zeroWinFrequency: number;
    readonly variance: number;
    readonly standardDeviation: number;
    readonly maxWin: number;
    readonly maxWinProbability: number;
    readonly payoutDistribution: readonly WeightedOutcomePayoutBucket[];
};
