export type StudioContext = {mode: "home"} | {mode: "project"; projectRoot: string};

export type RecentProjectEntry = {
    projectRoot: string;
    name: string;
    openedAt: string;
};

export type PokieGameManifest = {
    id: string;
    name: string;
    version: string;
    description?: string;
    author?: string;
};

// The Project Dashboard's own read model — see cli/studio/ProjectDashboardContext.ts (the server's
// copy of this same type; kept as a separate client-side copy, same convention as every other type
// in this file, since the studio-client TS project compiles independently from cli/studio).
export type ProjectDashboardContext =
    | {status: "empty"}
    | {status: "loading"; projectRoot: string}
    | {status: "loaded"; projectRoot: string; game: PokieGameManifest}
    | {status: "error"; projectRoot: string; error: string};

export type GameBuildInfo = {
    schemaVersion: number;
    generatedBy: string;
    pokieVersion: string;
    generatedAt: string;
    blueprintHash: string;
    source?: string;
    files?: string[];
    game: {id: string; name: string; version: string};
};

export type GamePackageInspectionReport = {
    packageRoot: string;
    valid: boolean;
    error?: string;
    packageJson?: {name?: string; version?: string; description?: string};
    generated: boolean;
    buildInfo?: GameBuildInfo;
};

export type ValidationIssue = {
    code: string;
    severity: "error" | "warning" | "info";
    message: string;
    details?: Record<string, unknown>;
    suggestion?: string;
};

export type PokieGamePackageValidationReport = {
    packageRoot: string;
    valid: boolean;
    game: {id: string; name: string; version: string} | null;
    errors: ValidationIssue[];
    warnings: ValidationIssue[];
    suggestions: string[];
};

export type SimulationReportBreakdownComponent = {
    rounds: number;
    totalBet: number;
    totalWin: number;
    rtp: number;
    hitFrequency: number;
    maxWin: number;
    contribution: number;
};

export type SimulationReportReproducibility = {
    game: {id: string; name: string; version: string};
    seed: string | null;
    requestedRounds: number;
    actualRounds: number;
    command: string;
};

// The server's copy of this same type lives in "pokie" itself (src/reporting/SimulationReport.ts) —
// kept as its own client-side copy here, same convention as every other type in this file.
export type SimulationReport = {
    game: {id: string; name: string; version: string};
    requestedRounds: number;
    rounds: number;
    seed: string | null;
    totalBet: number;
    totalWin: number;
    rtp: number;
    hitFrequency: number;
    maxWin: number;
    durationMs: number;
    spinsPerSecond: number;
    reproducibility?: SimulationReportReproducibility;
    warnings?: string[];
    recommendations?: string[];
    breakdown?: {components: Record<string, SimulationReportBreakdownComponent>};
};

// The extra volatility/standard-deviation/confidence-interval fields Studio surfaces alongside the
// standard SimulationReport — see cli/studio/simulation/StudioSimulationJobView.ts's own doc comment
// for why these live here rather than as a change to SimulationReport itself.
export type StudioSimulationStatisticsView = {
    volatility: number;
    payoutStandardDeviation: number;
    returnStandardDeviation: number;
    averagePayoutConfidenceInterval95: {low: number; high: number};
    rtpConfidenceInterval95: {low: number; high: number};
};

export type StudioSimulationStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export type StudioSimulationJobView = {
    id: string;
    status: StudioSimulationStatus;
    rounds: number;
    seed?: string;
    startedAt: string;
    roundsCompleted: number;
    durationMs: number;
    report?: SimulationReport;
    statistics?: StudioSimulationStatisticsView;
    error?: string;
};

// One row of GET /api/project/reports — only ever built from a "completed" job, see
// cli/studio/simulation/StudioSimulationReportListEntry.ts's own doc comment.
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
