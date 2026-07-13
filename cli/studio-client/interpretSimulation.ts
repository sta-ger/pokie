import type {SimulationReport, SimulationReportBreakdownComponent, StudioSimulationJobView} from "./types.js";

// Pure view-model transforms for the Simulation tab — same role as interpretProjectDashboard.ts:
// main.ts/dom.ts consume these instead of branching on the raw job/report shapes themselves, and
// (being pure) these are unit-testable without a real DOM/jsdom.

export type SimulationProgressView = {
    status: StudioSimulationJobView["status"];
    roundsCompleted: number;
    rounds: number;
    workers: number;
    percent: number;
    durationMs: number;
    // Only ever set when status === "failed" — the job's own safe error message (see
    // StudioSimulationService), not an API-call failure (those are rendered separately by main.ts's
    // own catch handling around each apiClient call).
    error?: string;
};

export function describeSimulationProgress(job: StudioSimulationJobView): SimulationProgressView {
    const percent = job.rounds > 0 ? Math.min(100, Math.round((job.roundsCompleted / job.rounds) * 100)) : 0;
    return {
        status: job.status,
        roundsCompleted: job.roundsCompleted,
        rounds: job.rounds,
        workers: job.workers,
        percent,
        durationMs: job.durationMs,
        error: job.error,
    };
}

export function isSimulationActive(job: StudioSimulationJobView): boolean {
    return job.status === "queued" || job.status === "running";
}

export function isSimulationTerminal(job: StudioSimulationJobView): boolean {
    return job.status === "completed" || job.status === "failed" || job.status === "cancelled";
}

export type BreakdownRowView = SimulationReportBreakdownComponent & {category: string};

// undefined (not an empty array) when the report has no breakdown at all — a game whose session
// doesn't implement the optional categorization contract — matching SimulationReport.breakdown's own
// "absent, not empty" convention (see docs/cli.md's own note on this).
export function describeBreakdown(report: SimulationReport): BreakdownRowView[] | undefined {
    if (!report.breakdown) {
        return undefined;
    }
    return Object.entries(report.breakdown.components).map(([category, component]) => ({category, ...component}));
}

export type SimulationReportView = {
    game: {id: string; name: string; version: string};
    rounds: number;
    requestedRounds: number;
    seed: string | null;
    totalBet: number;
    totalWin: number;
    rtp: number;
    hitFrequency: number;
    maxWin: number;
    durationMs: number;
    spinsPerSecond: number;
    workers: number;
    volatility?: number;
    payoutStandardDeviation?: number;
    rtpConfidenceInterval95?: {low: number; high: number};
    averagePayoutConfidenceInterval95?: {low: number; high: number};
    breakdown?: BreakdownRowView[];
    warnings: string[];
    reproducibilityCommand?: string;
};

// Bundles a completed job's SimulationReport with the extra statistics Studio surfaces alongside it
// (see StudioSimulationStatisticsView) into the one shape dom.ts renders — old reports/games without
// a breakdown (or without `statistics`, e.g. a job view reconstructed from an older format) simply
// leave those fields undefined rather than failing.
export function describeSimulationReport(
    report: SimulationReport,
    statistics?: StudioSimulationJobView["statistics"],
): SimulationReportView {
    return {
        game: report.game,
        rounds: report.rounds,
        requestedRounds: report.requestedRounds,
        seed: report.seed,
        totalBet: report.totalBet,
        totalWin: report.totalWin,
        rtp: report.rtp,
        hitFrequency: report.hitFrequency,
        maxWin: report.maxWin,
        durationMs: report.durationMs,
        spinsPerSecond: report.spinsPerSecond,
        workers: report.workers ?? 1,
        volatility: statistics?.volatility,
        payoutStandardDeviation: statistics?.payoutStandardDeviation,
        rtpConfidenceInterval95: statistics?.rtpConfidenceInterval95,
        averagePayoutConfidenceInterval95: statistics?.averagePayoutConfidenceInterval95,
        breakdown: describeBreakdown(report),
        warnings: report.warnings ?? [],
        reproducibilityCommand: report.reproducibility?.command,
    };
}
