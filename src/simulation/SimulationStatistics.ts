export type SimulationStatistics = {
    rounds: number;
    hitCount: number;
    totalBet: number;
    totalPayout: number;
    averageBet: number;
    averagePayout: number;
    averagePayoutConfidenceInterval95: {low: number; high: number};
    rtp: number;
    rtpConfidenceInterval95: {low: number; high: number};
    volatility: number;
    payoutStandardDeviation: number;
    returnStandardDeviation: number;
    maxWin: number;
    payoutHistogram: Record<string, number>;
};
