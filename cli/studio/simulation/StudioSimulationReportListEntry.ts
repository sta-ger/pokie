// One row of GET /api/project/reports — only ever built from a "completed" job (the only status with
// an actual report to summarize; see StudioSimulationService.listReports()), so every field below is
// always present except `seed`, which is legitimately optional at the domain level regardless of
// status.
export type StudioSimulationReportListEntry = {
    id: string;
    status: "completed";
    game: {id: string; version: string};
    requestedRounds: number;
    actualRounds: number;
    seed?: string;
    rtp: number;
    hitFrequency: number;
    maxWin: number;
    startedAt: string;
    completedAt: string;
    durationMs: number;
    hasWarnings: boolean;
};
