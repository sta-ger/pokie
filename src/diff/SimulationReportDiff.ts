export type SimulationReportMetricDiff = {
    left: number;
    right: number;
    delta: number;
    percentDelta: number | null;
};

export type SimulationReportDiff = {
    game: {
        left: {id: string; name: string; version: string};
        right: {id: string; name: string; version: string};
        changed: boolean;
    };
    seed: {
        left: string | null;
        right: string | null;
        changed: boolean;
    };
    requestedRounds: SimulationReportMetricDiff;
    rounds: SimulationReportMetricDiff;
    totalBet: SimulationReportMetricDiff;
    totalWin: SimulationReportMetricDiff;
    rtp: SimulationReportMetricDiff;
    hitFrequency: SimulationReportMetricDiff;
    maxWin: SimulationReportMetricDiff;
    durationMs: SimulationReportMetricDiff;
    spinsPerSecond: SimulationReportMetricDiff;
    warnings: string[];
};
