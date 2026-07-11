// Raw per-category totals produced by AggregateSimulationRunner (see SimulationRoundCategoryDetermining).
// Mirrors SimulationStatistics's role: a simulation-side output type that src/reporting shapes into
// the public SimulationReportBreakdownComponent field of a SimulationReport.
export type SimulationBreakdownComponent = {
    rounds: number;
    totalBet: number;
    totalWin: number;
    rtp: number;
    hitFrequency: number;
    maxWin: number;
};
