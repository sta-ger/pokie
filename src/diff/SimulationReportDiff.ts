import type {SimulationReportBreakdownComponent} from "../reporting/SimulationReportBreakdown.js";

export type SimulationReportMetricDiff = {
    left: number;
    right: number;
    delta: number;
    percentDelta: number | null;
};

export type SimulationReportBreakdownComponentDiff = {
    left: SimulationReportBreakdownComponent | null;
    right: SimulationReportBreakdownComponent | null;
    rounds: SimulationReportMetricDiff;
    totalBet: SimulationReportMetricDiff;
    totalWin: SimulationReportMetricDiff;
    rtp: SimulationReportMetricDiff;
    contribution: SimulationReportMetricDiff;
    hitFrequency: SimulationReportMetricDiff;
    maxWin: SimulationReportMetricDiff;
};

// Only populated when both sides of the diff have a "breakdown" field — an older report (or one
// from a game that doesn't categorize rounds) simply leaves this undefined, it's never diffed
// against a report that does have it.
export type SimulationReportBreakdownDiff = {
    components: Record<string, SimulationReportBreakdownComponentDiff>;
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
    // Present whenever either side locked a bet mode (see ParallelSimulationRunOptions.betModeId) --
    // absent for a plain diff between two reports that never selected one, same as every other
    // additive-optional field this diff carries over from SimulationReport itself.
    betMode?: {
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
    breakdown?: SimulationReportBreakdownDiff;
};
