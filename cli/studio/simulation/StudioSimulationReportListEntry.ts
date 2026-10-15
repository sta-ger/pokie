// One row of GET /api/project/reports — only ever built from a "completed" job (the only status with
// an actual report to summarize; see StudioSimulationService.listReports()), so every field below is
// always present except `seed`, which is legitimately optional at the domain level regardless of
// status.
export type StudioSimulationReportListEntry = {
    convergence?: import("../../../src/simulation/SimulationConvergenceOptions.js").SimulationConvergenceOptions;
    id: string;
    status: "completed";
    game: {id: string; version: string};
    requestedRounds: number;
    actualRounds?: number;
    sampling?: import("../../../src/reporting/SimulationReport.js").SimulationReport["sampling"];
    seed?: string;
    workers: number;
    rtp?: number;
    hitFrequency?: number;
    maxWin?: number;
    startedAt: string;
    completedAt: string;
    durationMs: number;
    hasWarnings: boolean;
    // Package selected mode/all policy, or the concrete native outcome-library mode.
    modeName?: string;
    modes?: Record<string, {rounds: number; betMode?: string}>;
};
