export type StudioContext = {mode: "home"} | {mode: "project"; projectRoot: string};

export type RecentProjectEntry = {
    projectRoot: string;
    name: string;
    openedAt: string;
};

// GET /api/home/recent-projects's own DTO — see cli/studio/home/StudioHomeRecentProjectView.ts's own
// doc comment. A missing project is flagged, never silently dropped from the list.
export type StudioHomeRecentProjectView = RecentProjectEntry & {missing: boolean};

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

// POST /api/home/projects/create and /init's shared DTO — see
// cli/studio/home/StudioScaffoldResultView.ts's own doc comment (the two flows' underlying
// ScaffoldResult shapes are already identical).
export type StudioScaffoldResultView =
    | {
          status: "ok";
          projectRoot: string;
          manifest: PokieGameManifest;
          createdFiles: string[];
          updatedFiles: string[];
          skippedFiles: string[];
      }
    | {status: "error"; error: string};

// POST /api/home/projects/build/preview's own DTO — see cli/studio/home/StudioBuildPreviewView.ts's
// own doc comment. Never the result of anything being written to disk.
export type StudioBuildPreviewView =
    | {status: "load-error"; error: string}
    | {status: "invalid"; errors: ValidationIssue[]; warnings: ValidationIssue[]}
    | {
          status: "ok";
          warnings: ValidationIssue[];
          manifest: PokieGameManifest;
          reels: number;
          rows: number;
          symbolsCount: number;
          blueprintHash: string;
          expectedFiles: string[];
      };

// POST /api/home/projects/build's own DTO — see cli/studio/home/StudioBuildResult.ts's own doc
// comment.
export type StudioBuildResult =
    | {status: "load-error"; error: string}
    | {status: "invalid"; errors: ValidationIssue[]; warnings: ValidationIssue[]}
    | {status: "error"; error: string}
    | {
          status: "ok";
          projectRoot: string;
          manifest: PokieGameManifest;
          createdFiles: string[];
          buildInfo: GameBuildInfo;
          unchanged: boolean;
          warnings: ValidationIssue[];
      };

// POST /api/home/blueprints/validate's own DTO — see cli/studio/blueprint/StudioBlueprintValidationView.ts's
// own doc comment. Never the result of anything being read/written on disk.
export type StudioBlueprintValidationView =
    | {status: "ok"; warnings: ValidationIssue[]}
    | {status: "invalid"; errors: ValidationIssue[]; warnings: ValidationIssue[]};

export type ReelStripConstraintViolation = {
    constraintId: string;
    message: string;
    positions?: number[];
    details?: Record<string, unknown>;
};

export type ReelStripGenerationDiagnostic = {
    attempt: number;
    accepted: boolean;
    violations: ReelStripConstraintViolation[];
    score?: number;
};

export type ReelStripAnalysis = {
    length: number;
    symbolCounts: Record<string, number>;
    symbolFrequencies: Record<string, number>;
    minimumCircularDistances: Record<string, number>;
    maximumCircularDistances: Record<string, number>;
    maximumConsecutiveOccurrences: Record<string, number>;
};

// POST /api/home/blueprints/reel-strip-generation-preview's own DTO — see
// cli/studio/blueprint/StudioReelStripGenerationView.ts's own doc comment. Never the result of
// anything being read/written on disk; a "generated" reel's success: false carries the same
// diagnostics/violations "pokie build" itself would report for an unsatisfiable config.
export type StudioReelStripGenerationReelView =
    | {reelIndex: number; type: "literal"; strip: string[]; analysis: ReelStripAnalysis}
    | {
          reelIndex: number;
          type: "generated";
          seed: number;
          success: true;
          attemptsUsed: number;
          diagnostics: ReelStripGenerationDiagnostic[];
          strip: string[];
          analysis: ReelStripAnalysis;
      }
    | {
          reelIndex: number;
          type: "generated";
          seed: number;
          success: false;
          attemptsUsed: number;
          diagnostics: ReelStripGenerationDiagnostic[];
      };

// Always "ok": `errors`/`warnings` are surfaced *alongside* `reels`, never instead of them -- a
// blueprint-level problem unrelated to reelStripGeneration itself never hides every other,
// resolvable reel's result. See StudioReelStripGenerationView.ts's own doc comment.
export type StudioReelStripGenerationView = {
    status: "ok";
    errors: ValidationIssue[];
    warnings: ValidationIssue[];
    reels: StudioReelStripGenerationReelView[];
};

// POST /api/home/blueprints/load's own DTO — see cli/studio/blueprint/StudioBlueprintLoadView.ts's own
// doc comment. `blueprint` is the raw parsed JSON value (unknown), not yet validated.
export type StudioBlueprintLoadView = {status: "ok"; path: string; blueprint: unknown} | {status: "load-error"; error: string};

// POST /api/home/blueprints/save's own DTO — see cli/studio/blueprint/StudioBlueprintSaveView.ts's own
// doc comment. "conflict" means the file already exists and the request needs `overwrite: true` to
// replace it.
export type StudioBlueprintSaveView =
    | {status: "ok"; path: string}
    | {status: "conflict"; path: string; error: string}
    | {status: "error"; error: string};

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
    workerSeedStrategy?: string;
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
    workers?: number;
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
    workers: number;
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
    workers: number;
    rtp: number;
    hitFrequency: number;
    maxWin: number;
    startedAt: string;
    completedAt: string;
    durationMs: number;
    hasWarnings: boolean;
};

// The server's copy of this same type lives in "pokie" itself (src/replay/ReplayDescriptor.ts) —
// kept as its own client-side copy here, same convention as every other type in this file.
export type ReplayDescriptor = {
    game: {id: string; name: string; version: string};
    seed: string | null;
    round: number;
    totalBet: number;
    totalWin: number;
    screen: unknown[][] | null;
    timestamp: number;
    durationMs: number;
};

export type StudioReplayStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

// The typed DTO every /api/project/replays* endpoint returns — see
// cli/studio/replay/StudioReplayJobView.ts's own doc comment. `descriptor` is only present once
// `status` is "completed"; `error` only once `status` is "failed".
export type StudioReplayJobView = {
    id: string;
    status: StudioReplayStatus;
    round: number;
    seed?: string;
    startedAt: string;
    completedRounds: number;
    durationMs: number;
    game?: {id: string; name: string; version: string};
    descriptor?: ReplayDescriptor;
    error?: string;
};

// One row of GET /api/project/replays — see cli/studio/replay/StudioReplayListEntry.ts's own doc
// comment (no `screen`, kept out of the list summary; every job for the project regardless of status,
// unlike Simulation's Reports list which only ever shows completed jobs).
export type StudioReplayListEntry = {
    id: string;
    status: StudioReplayStatus;
    game?: {id: string; name: string; version: string};
    round: number;
    seed?: string;
    completedRounds: number;
    totalBet?: number;
    totalWin?: number;
    startedAt: string;
    completedAt?: string;
    durationMs: number;
    error?: string;
};

// GET/POST /api/project/runtime*'s own DTO — see cli/studio/runtime/StudioRuntimeStateView.ts's own
// doc comment. "starting"/"stopping" are only ever observed transiently (a concurrent GET racing an
// in-flight start/stop), never held between two separate calls.
export type StudioRuntimeStateView =
    | {status: "stopped"}
    | {status: "starting"}
    | {
          status: "running";
          host: string;
          port: number;
          baseUrl: string;
          debug: boolean;
          repositoryMode: "memory" | "file";
          startedAt: string;
      }
    | {status: "stopping"}
    | {status: "failed"; error: string};

// The Runtime tab's Session Tools response DTO — see cli/studio/runtime/StudioRuntimeSessionView.ts's
// own doc comment. `sessionVersion` is present whenever the runtime's configured repository is
// versioned, regardless of debug mode; `debug` is only present when the runtime was started with
// debug mode on.
export type StudioRuntimeSessionView = {
    sessionId: string;
    game: {id: string; name: string; version: string};
    credits: number;
    bet?: number;
    win?: number;
    screen?: unknown[][];
    sessionVersion?: number;
    debug?: {
        stateAfter: unknown;
        stateBefore?: unknown;
        debugData?: Record<string, unknown>;
        requestId?: string;
    };
} & Record<string, unknown>;

// GET /api/project/deployment/targets' own DTO — see
// cli/studio/deployment/StudioDeploymentTargetSummary.ts's own doc comment.
export type StudioDeploymentTargetSummary = {
    id: string;
    version: string;
    requirements: {minPokieVersion?: string; symbolAlphabet?: "numeric" | "any"; requiresHomogeneousProvenance?: boolean};
    capabilities: string[];
};

// One mode row of a POST /api/project/deployment/runs request body.
export type StudioDeploymentModeInput = {
    modeName: string;
    libraryPath: string;
};

// One generated artifact as sent back from POST /api/project/deployment/runs — see
// cli/studio/deployment/StudioDeploymentArtifactView.ts's own doc comment: `content` is always a
// plain string, decoded server-side.
export type StudioDeploymentArtifactView = {
    relativePath: string;
    content: string;
};

// POST /api/project/deployment/runs' own DTO — see cli/studio/deployment/StudioDeploymentRunView.ts's
// own doc comment. Every stage field is present only when ExternalDeploymentService actually ran that
// stage — used directly to drive the Deployment tab's stage-by-stage diagnostics display.
export type StudioDeploymentRunView = {
    targetId: string;
    publish: boolean;
    descriptorIssues: ValidationIssue[];
    compatibilityIssues: ValidationIssue[];
    projectionIssues: ValidationIssue[];
    generation?: {
        artifacts: StudioDeploymentArtifactView[];
        issues: ValidationIssue[];
    };
    artifactIssues: ValidationIssue[];
    diagnostic?: {ok: boolean; checks: {name: string; ok: boolean; message?: string}[]};
    delivery?: {delivered: boolean; details?: Record<string, unknown>; issues?: ValidationIssue[]};
};
