export type SimulationStatistics = {
    rounds: number;
    hitCount: number;
    totalBet: number;
    totalPayout: number;
    averageBet: number;
    averagePayout: number;
    rtp: number;
    volatility: number;
    maxWin: number;
    payoutHistogram: Record<string, number>;
    confidenceInterval95: {low: number; high: number};
};
