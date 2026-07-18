import type {
    GamePackageInspectionReport,
    OutcomeLibrarySelector,
    PokieGameManifest,
    PokieGamePackageValidationReport,
    ProjectDashboardContext,
    StudioBlueprintLoadView,
    StudioBlueprintSaveView,
    StudioBlueprintValidationView,
    StudioBuildPreviewView,
    StudioBuildResult,
    StudioContext,
    StudioDeploymentModeInput,
    StudioDeploymentRunView,
    StudioDeploymentTargetSummary,
    StudioHomeRecentProjectView,
    StudioOutcomeLibraryCompareView,
    StudioOutcomeLibraryDeepValidateView,
    StudioOutcomeLibrarySelectView,
    StudioParSheetExportView,
    StudioParSheetImportView,
    StudioReelStripGenerationView,
    StudioReplayJobView,
    StudioReplayListEntry,
    StudioRuntimeSessionView,
    StudioRuntimeStateView,
    StudioScaffoldResultView,
    StudioSimulationJobView,
    StudioSimulationReportDetail,
    StudioSimulationReportListEntry,
} from "./types";

// Same minimal Fetch subset as cli/client/apiClient.ts's FetchLike — kept structurally compatible
// with the real global `fetch` so tests can inject a trivial fake instead of needing jsdom/network.
export type FetchLike = (
    url: string,
    init?: {method?: string; headers?: Record<string, string>; body?: string},
) => Promise<{ok: boolean; status: number; json(): Promise<unknown>}>;

type ProjectActionResult = {context: StudioContext; manifest: PokieGameManifest};

export async function getContext(fetchImpl: FetchLike): Promise<StudioContext> {
    const response = await fetchImpl("/api/context");
    return (await response.json()) as StudioContext;
}

export async function listRecentProjects(fetchImpl: FetchLike): Promise<StudioHomeRecentProjectView[]> {
    const response = await fetchImpl("/api/home/recent-projects");
    return (await response.json()) as StudioHomeRecentProjectView[];
}

export type CreateProjectRequest = {
    destinationDir: string;
    name: string;
    gameId?: string;
    gameName?: string;
    version?: string;
};

// Never throws for a domain-level failure (an invalid name, a destination that already exists) — the
// DTO's own `status` field carries that; only a genuinely malformed request throws (see
// validateCreateProjectRequest on the server side). Same reasoning for initProject/previewBuild/
// buildProject below.
export async function createProject(fetchImpl: FetchLike, request: CreateProjectRequest): Promise<StudioScaffoldResultView> {
    const response = await fetchImpl("/api/home/projects/create", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(request),
    });
    if (!response.ok) {
        throw new Error(await extractErrorMessage(response, "Failed to create project"));
    }
    return (await response.json()) as StudioScaffoldResultView;
}

export type InitProjectRequest = {directory: string};

export async function initProject(fetchImpl: FetchLike, request: InitProjectRequest): Promise<StudioScaffoldResultView> {
    const response = await fetchImpl("/api/home/projects/init", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(request),
    });
    if (!response.ok) {
        throw new Error(await extractErrorMessage(response, "Failed to initialize project"));
    }
    return (await response.json()) as StudioScaffoldResultView;
}

export type BuildRequest = {blueprintPath: string; outDir?: string};

// Never writes anything — see StudioHomeService.previewBuild()'s own doc comment.
export async function previewBuild(fetchImpl: FetchLike, request: BuildRequest): Promise<StudioBuildPreviewView> {
    const response = await fetchImpl("/api/home/projects/build/preview", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(request),
    });
    if (!response.ok) {
        throw new Error(await extractErrorMessage(response, "Failed to preview build"));
    }
    return (await response.json()) as StudioBuildPreviewView;
}

export async function buildProject(fetchImpl: FetchLike, request: BuildRequest): Promise<StudioBuildResult> {
    const response = await fetchImpl("/api/home/projects/build", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(request),
    });
    if (!response.ok) {
        throw new Error(await extractErrorMessage(response, "Failed to build project"));
    }
    return (await response.json()) as StudioBuildResult;
}

// Never writes/reads anything on disk — see StudioBlueprintService.validate()'s own doc comment.
export async function validateBlueprint(fetchImpl: FetchLike, blueprint: unknown): Promise<StudioBlueprintValidationView> {
    const response = await fetchImpl("/api/home/blueprints/validate", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({blueprint}),
    });
    if (!response.ok) {
        throw new Error(await extractErrorMessage(response, "Failed to validate blueprint"));
    }
    return (await response.json()) as StudioBlueprintValidationView;
}

export async function previewReelStripGeneration(fetchImpl: FetchLike, blueprint: unknown): Promise<StudioReelStripGenerationView> {
    const response = await fetchImpl("/api/home/blueprints/reel-strip-generation-preview", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({blueprint}),
    });
    if (!response.ok) {
        throw new Error(await extractErrorMessage(response, "Failed to resolve reel strip generation"));
    }
    return (await response.json()) as StudioReelStripGenerationView;
}

export async function loadBlueprint(fetchImpl: FetchLike, path: string): Promise<StudioBlueprintLoadView> {
    const response = await fetchImpl("/api/home/blueprints/load", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({path}),
    });
    if (!response.ok) {
        throw new Error(await extractErrorMessage(response, "Failed to load blueprint"));
    }
    return (await response.json()) as StudioBlueprintLoadView;
}

// A 409 ("conflict") is an expected domain outcome, not a failed request — handled the same way
// startSimulation/runReplay handle their own 409s: parsed and returned as a typed result, not thrown.
export async function saveBlueprint(
    fetchImpl: FetchLike,
    path: string,
    blueprint: unknown,
    overwrite: boolean,
): Promise<StudioBlueprintSaveView> {
    const response = await fetchImpl("/api/home/blueprints/save", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({path, blueprint, overwrite}),
    });
    if (response.status === 409) {
        return (await response.json()) as StudioBlueprintSaveView;
    }
    if (!response.ok) {
        throw new Error(await extractErrorMessage(response, "Failed to save blueprint"));
    }
    return (await response.json()) as StudioBlueprintSaveView;
}

// Never writes anything — see StudioBlueprintService.importParSheet()'s own doc comment. Domain-level
// import failures (missing/malformed workbook, mapping errors) are never thrown -- they come back as
// "load-error" (a bad path) or as errors/warnings inside an "ok" result (a well-formed workbook whose own
// content has problems), same convention as loadBlueprint()'s own "load-error" branch.
export async function importParSheet(fetchImpl: FetchLike, path: string): Promise<StudioParSheetImportView> {
    const response = await fetchImpl("/api/home/blueprints/par-import", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({path}),
    });
    if (!response.ok) {
        throw new Error(await extractErrorMessage(response, "Failed to import PAR sheet"));
    }
    return (await response.json()) as StudioParSheetImportView;
}

// A 409 ("conflict") is an expected domain outcome, not a failed request — same convention as
// saveBlueprint()'s own 409 handling.
export async function exportParSheet(
    fetchImpl: FetchLike,
    blueprint: unknown,
    path: string,
    overwrite: boolean,
    sourcePath?: string,
): Promise<StudioParSheetExportView> {
    const response = await fetchImpl("/api/home/blueprints/par-export", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({blueprint, path, overwrite, sourcePath}),
    });
    if (response.status === 409) {
        return (await response.json()) as StudioParSheetExportView;
    }
    if (!response.ok) {
        throw new Error(await extractErrorMessage(response, "Failed to export PAR sheet"));
    }
    return (await response.json()) as StudioParSheetExportView;
}

// Never writes anything — see StudioBlueprintService.previewBuild()'s own doc comment.
export async function previewBlueprintBuild(
    fetchImpl: FetchLike,
    blueprint: unknown,
    outDir?: string,
    sourcePath?: string,
): Promise<StudioBuildPreviewView> {
    const response = await fetchImpl("/api/home/blueprints/build-preview", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({blueprint, outDir, sourcePath}),
    });
    if (!response.ok) {
        throw new Error(await extractErrorMessage(response, "Failed to preview build"));
    }
    return (await response.json()) as StudioBuildPreviewView;
}

export async function buildBlueprint(
    fetchImpl: FetchLike,
    blueprint: unknown,
    outDir?: string,
    sourcePath?: string,
): Promise<StudioBuildResult> {
    const response = await fetchImpl("/api/home/blueprints/build", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({blueprint, outDir, sourcePath}),
    });
    if (!response.ok) {
        throw new Error(await extractErrorMessage(response, "Failed to build project"));
    }
    return (await response.json()) as StudioBuildResult;
}

export async function openProject(fetchImpl: FetchLike, projectRoot: string): Promise<ProjectActionResult> {
    const response = await fetchImpl("/api/home/projects/open", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({projectRoot}),
    });
    if (!response.ok) {
        throw new Error(await extractErrorMessage(response, "Failed to open project"));
    }
    return (await response.json()) as ProjectActionResult;
}

export async function closeProject(fetchImpl: FetchLike): Promise<StudioContext> {
    const response = await fetchImpl("/api/projects/close", {method: "POST"});
    const body = (await response.json()) as {context: StudioContext};
    return body.context;
}

export async function getProjectContext(fetchImpl: FetchLike): Promise<ProjectDashboardContext> {
    const response = await fetchImpl("/api/project/context");
    return (await response.json()) as ProjectDashboardContext;
}

export async function inspectProject(fetchImpl: FetchLike): Promise<GamePackageInspectionReport> {
    const response = await fetchImpl("/api/project/inspect");
    if (!response.ok) {
        throw new Error(await extractErrorMessage(response, "Failed to inspect the project"));
    }
    return (await response.json()) as GamePackageInspectionReport;
}

export async function validateProject(fetchImpl: FetchLike): Promise<PokieGamePackageValidationReport> {
    const response = await fetchImpl("/api/project/validate");
    if (!response.ok) {
        throw new Error(await extractErrorMessage(response, "Failed to validate the project"));
    }
    return (await response.json()) as PokieGamePackageValidationReport;
}

export type StartSimulationResult =
    | {status: "created"; job: StudioSimulationJobView}
    | {status: "conflict"; activeJobId: string};

// Distinguishes the two different 409 cases the endpoint can return: "another simulation is already
// running for this project" (has an activeJobId — returned here as a typed result, not thrown, so a
// caller can jump straight to polling that job) vs. "no active project" or any other failure (thrown
// as a plain Error, same as every other apiClient function).
export async function startSimulation(
    fetchImpl: FetchLike,
    rounds: number,
    seed?: string,
    workers?: number,
): Promise<StartSimulationResult> {
    const response = await fetchImpl("/api/project/simulations", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({rounds, ...(seed === undefined ? {} : {seed}), ...(workers === undefined ? {} : {workers})}),
    });

    if (response.status === 409) {
        const body = (await response.json()) as {activeJobId?: string; error?: string};
        if (body.activeJobId !== undefined) {
            return {status: "conflict", activeJobId: body.activeJobId};
        }
        throw new Error(body.error ?? "Failed to start simulation (HTTP 409).");
    }

    if (!response.ok) {
        throw new Error(await extractErrorMessage(response, "Failed to start simulation"));
    }
    return {status: "created", job: (await response.json()) as StudioSimulationJobView};
}

export async function getSimulation(fetchImpl: FetchLike, id: string): Promise<StudioSimulationJobView> {
    const response = await fetchImpl(`/api/project/simulations/${encodeURIComponent(id)}`);
    if (!response.ok) {
        throw new Error(await extractErrorMessage(response, "Failed to fetch simulation status"));
    }
    return (await response.json()) as StudioSimulationJobView;
}

export async function cancelSimulation(fetchImpl: FetchLike, id: string): Promise<StudioSimulationJobView> {
    const response = await fetchImpl(`/api/project/simulations/${encodeURIComponent(id)}`, {method: "DELETE"});
    if (!response.ok) {
        throw new Error(await extractErrorMessage(response, "Failed to cancel simulation"));
    }
    return (await response.json()) as StudioSimulationJobView;
}

export async function listReports(fetchImpl: FetchLike): Promise<StudioSimulationReportListEntry[]> {
    const response = await fetchImpl("/api/project/reports");
    if (!response.ok) {
        throw new Error(await extractErrorMessage(response, "Failed to list reports"));
    }
    return (await response.json()) as StudioSimulationReportListEntry[];
}

export async function getReport(fetchImpl: FetchLike, id: string): Promise<StudioSimulationReportDetail> {
    const response = await fetchImpl(`/api/project/reports/${encodeURIComponent(id)}`);
    if (!response.ok) {
        throw new Error(await extractErrorMessage(response, "Failed to load report"));
    }
    return (await response.json()) as StudioSimulationReportDetail;
}

export type ReportDownloadFormat = "json" | "markdown" | "html";

// Downloads themselves are plain browser-native navigations (an <a href download> — the server sets
// Content-Disposition: attachment, so no fetch/blob dance is needed); this only builds the URL those
// links point at, consistently, in one place.
export function buildReportDownloadUrl(id: string, format: ReportDownloadFormat): string {
    return `/api/project/reports/${encodeURIComponent(id)}/download?format=${format}`;
}

export type StartReplayResult =
    | {status: "created"; job: StudioReplayJobView}
    | {status: "conflict"; activeJobId: string};

// Distinguishes the two different 409 cases the endpoint can return — same reasoning as
// startSimulation: "another replay is already running for this project" (has an activeJobId,
// returned here as a typed result) vs. "no active project" or any other failure (thrown as a plain
// Error). The replay itself runs in the background (see StudioReplayExecutionService) — this call
// always returns immediately with a "queued" job, never the finished result.
export async function runReplay(fetchImpl: FetchLike, round: number, seed?: string): Promise<StartReplayResult> {
    const response = await fetchImpl("/api/project/replays", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(seed === undefined ? {round} : {round, seed}),
    });

    if (response.status === 409) {
        const body = (await response.json()) as {activeJobId?: string; error?: string};
        if (body.activeJobId !== undefined) {
            return {status: "conflict", activeJobId: body.activeJobId};
        }
        throw new Error(body.error ?? "Failed to start replay (HTTP 409).");
    }

    if (!response.ok) {
        throw new Error(await extractErrorMessage(response, "Failed to start replay"));
    }
    return {status: "created", job: (await response.json()) as StudioReplayJobView};
}

export async function getReplay(fetchImpl: FetchLike, id: string): Promise<StudioReplayJobView> {
    const response = await fetchImpl(`/api/project/replays/${encodeURIComponent(id)}`);
    if (!response.ok) {
        throw new Error(await extractErrorMessage(response, "Failed to load replay"));
    }
    return (await response.json()) as StudioReplayJobView;
}

export async function cancelReplay(fetchImpl: FetchLike, id: string): Promise<StudioReplayJobView> {
    const response = await fetchImpl(`/api/project/replays/${encodeURIComponent(id)}`, {method: "DELETE"});
    if (!response.ok) {
        throw new Error(await extractErrorMessage(response, "Failed to cancel replay"));
    }
    return (await response.json()) as StudioReplayJobView;
}

export async function listReplays(fetchImpl: FetchLike): Promise<StudioReplayListEntry[]> {
    const response = await fetchImpl("/api/project/replays");
    if (!response.ok) {
        throw new Error(await extractErrorMessage(response, "Failed to list replays"));
    }
    return (await response.json()) as StudioReplayListEntry[];
}

// Same "plain browser-native navigation" reasoning as buildReportDownloadUrl — no fetch/blob dance,
// the server's Content-Disposition header does the rest.
export function buildReplayDownloadUrl(id: string): string {
    return `/api/project/replays/${encodeURIComponent(id)}/download`;
}

export type InspectReplayArtifactResult = {round: number; seed?: string; artifactWarnings: string[]};

// Validates a pasted "Replay Artifact" JSON before attempting an actual reproduction (the Find/Load
// steps of the Replay & Debug workflow) — reuses the exact same round/seed validation the real
// POST /api/project/replays already applies (see StudioServer.handleInspectReplayArtifact), so this
// can never accept something the actual replay start would then reject. Throws (the "invalid artifact"
// state) for a malformed round/seed; a structurally invalid nested `artifact` is reported back as
// non-fatal `artifactWarnings` instead, since round/seed alone are enough to attempt the reproduction.
export async function inspectReplayArtifact(fetchImpl: FetchLike, descriptor: unknown): Promise<InspectReplayArtifactResult> {
    const response = await fetchImpl("/api/project/replays/inspect-artifact", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(descriptor),
    });
    if (!response.ok) {
        throw new Error(await extractErrorMessage(response, "Failed to inspect replay artifact"));
    }
    return (await response.json()) as InspectReplayArtifactResult;
}

async function extractErrorMessage(
    response: {status: number; json(): Promise<unknown>},
    fallback: string,
): Promise<string> {
    try {
        const body = (await response.json()) as {error?: string};
        return body.error ?? `${fallback} (HTTP ${response.status}).`;
    } catch {
        return `${fallback} (HTTP ${response.status}).`;
    }
}

export async function getRuntimeState(fetchImpl: FetchLike): Promise<StudioRuntimeStateView> {
    const response = await fetchImpl("/api/project/runtime");
    if (!response.ok) {
        throw new Error(await extractErrorMessage(response, "Failed to fetch runtime status"));
    }
    return (await response.json()) as StudioRuntimeStateView;
}

// Replay & Debug's "Session Spin" find method — Studio's own bounded (last 20) in-memory record of
// recent spins (see StudioRuntimeManager.listRecentSpins()), most-recent-first. Always a 200 with
// possibly an empty array (nothing spun yet, debug mode was off, or the runtime was since
// stopped/restarted/the project switched) — never an error for "nothing to show".
export async function listRecentSpins(fetchImpl: FetchLike): Promise<StudioRuntimeSessionView[]> {
    const response = await fetchImpl("/api/project/runtime/spins");
    if (!response.ok) {
        throw new Error(await extractErrorMessage(response, "Failed to list recent spins"));
    }
    return (await response.json()) as StudioRuntimeSessionView[];
}

export type StartRuntimeOptions = {
    host?: string;
    port?: number;
    debug?: boolean;
    seed?: string | number;
    repositoryMode?: "memory" | "file";
};

export type StartRuntimeResult = StudioRuntimeStateView | {status: "already-running"; state: StudioRuntimeStateView};

// A 409 ("already running") is an expected domain outcome, not a failed request — handled the same
// way startSimulation/runReplay/saveBlueprint handle their own 409s: parsed and returned as a typed
// result, not thrown. Every other status (including the "failed" domain outcome, which rides on 200 —
// see StudioRuntimeManager's own doc comment) is just returned as the parsed StudioRuntimeStateView.
export async function startRuntime(fetchImpl: FetchLike, options: StartRuntimeOptions = {}): Promise<StartRuntimeResult> {
    const response = await fetchImpl("/api/project/runtime/start", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(options),
    });
    if (response.status === 409) {
        const body = (await response.json()) as {state: StudioRuntimeStateView};
        return {status: "already-running", state: body.state};
    }
    if (!response.ok) {
        throw new Error(await extractErrorMessage(response, "Failed to start runtime"));
    }
    return (await response.json()) as StudioRuntimeStateView;
}

// Omitting `options` reuses the runtime's last successful start options (see
// StudioRuntimeManager.restart()'s own doc comment) — never a conflict, unlike startRuntime, since
// restarting while already running is exactly the point.
export async function restartRuntime(fetchImpl: FetchLike, options?: StartRuntimeOptions): Promise<StudioRuntimeStateView> {
    const response = await fetchImpl("/api/project/runtime/restart", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: options === undefined ? undefined : JSON.stringify(options),
    });
    if (!response.ok) {
        throw new Error(await extractErrorMessage(response, "Failed to restart runtime"));
    }
    return (await response.json()) as StudioRuntimeStateView;
}

// Idempotent on the server side — stopping an already-stopped runtime is never an error.
export async function stopRuntime(fetchImpl: FetchLike): Promise<StudioRuntimeStateView> {
    const response = await fetchImpl("/api/project/runtime/stop", {method: "POST"});
    if (!response.ok) {
        throw new Error(await extractErrorMessage(response, "Failed to stop runtime"));
    }
    return (await response.json()) as StudioRuntimeStateView;
}

export type RuntimeSessionResult =
    | {status: "ok"; session: StudioRuntimeSessionView}
    | {status: "error"; message: string}
    | {status: "not-found"}
    | {status: "not-running"};

export type RuntimeSpinResult =
    | {status: "ok"; session: StudioRuntimeSessionView}
    | {status: "error"; message: string}
    | {status: "not-found"}
    | {status: "not-running"}
    | {status: "blocked"; message: string}
    | {status: "conflict"; message: string};

// Every outcome a Session Tools call can produce is handled as a typed result, never thrown: unknown
// session / insufficient balance / a stale expectedSessionVersion / the runtime not running are all
// outcomes the Runtime tab needs to render as distinct states, not failures to alert on.
async function readRuntimeSessionResult(response: {status: number; json(): Promise<unknown>}): Promise<RuntimeSessionResult> {
    if (response.status === 404) {
        return {status: "not-found"};
    }
    if (response.status === 409) {
        // create/get never produce a version conflict (spin-only) — a 409 here only ever means the
        // runtime isn't running.
        return {status: "not-running"};
    }
    const body = (await response.json()) as {status: "ok"; session: StudioRuntimeSessionView} | {status: "error"; error: string};
    if (body.status === "ok") {
        return {status: "ok", session: body.session};
    }
    return {status: "error", message: body.error};
}

async function readRuntimeSpinResult(response: {status: number; json(): Promise<unknown>}): Promise<RuntimeSpinResult> {
    if (response.status === 404) {
        return {status: "not-found"};
    }
    if (response.status === 400) {
        const body = (await response.json()) as {error: string};
        return {status: "blocked", message: body.error};
    }
    if (response.status === 409) {
        // "not-running" and "conflict" (a stale expectedSessionVersion) are both a 409 — `reason`
        // disambiguates them (see StudioServer.sendRuntimeErrorResult's own doc comment) instead of
        // pattern-matching `error`'s free-text message.
        const body = (await response.json()) as {error: string; reason: "not-running" | "conflict"};
        return body.reason === "conflict" ? {status: "conflict", message: body.error} : {status: "not-running"};
    }
    const body = (await response.json()) as {status: "ok"; session: StudioRuntimeSessionView} | {status: "error"; error: string};
    if (body.status === "ok") {
        return {status: "ok", session: body.session};
    }
    return {status: "error", message: body.error};
}

export async function createRuntimeSession(fetchImpl: FetchLike, seed?: string | number): Promise<RuntimeSessionResult> {
    const response = await fetchImpl("/api/project/runtime/sessions", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(seed === undefined ? {} : {seed}),
    });
    return readRuntimeSessionResult(response);
}

export async function getRuntimeSession(fetchImpl: FetchLike, sessionId: string): Promise<RuntimeSessionResult> {
    const response = await fetchImpl(`/api/project/runtime/sessions/${encodeURIComponent(sessionId)}`);
    return readRuntimeSessionResult(response);
}

export async function spinRuntimeSession(
    fetchImpl: FetchLike,
    sessionId: string,
    requestId?: string,
    expectedSessionVersion?: number,
): Promise<RuntimeSpinResult> {
    const body: Record<string, unknown> = {};
    if (requestId !== undefined) {
        body.requestId = requestId;
    }
    if (expectedSessionVersion !== undefined) {
        body.expectedSessionVersion = expectedSessionVersion;
    }
    const response = await fetchImpl(`/api/project/runtime/sessions/${encodeURIComponent(sessionId)}/spins`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(body),
    });
    return readRuntimeSpinResult(response);
}

export async function listDeploymentTargets(fetchImpl: FetchLike): Promise<StudioDeploymentTargetSummary[]> {
    const response = await fetchImpl("/api/project/deployment/targets");
    if (!response.ok) {
        throw new Error(await extractErrorMessage(response, "Failed to fetch deployment targets"));
    }
    return (await response.json()) as StudioDeploymentTargetSummary[];
}

// "publish: false" (the default) runs compatibility-check + preview only — see
// StudioDeploymentService.run()'s own doc comment for why this is the exact same call as a real
// deploy, just against a target with its own runtimeAdapter stripped, never a second/different
// pipeline. Never throws for a domain-level pipeline failure (incompatible content, a failed
// projector, an unreachable output directory, ...) — that's carried in the returned DTO's own
// stage-by-stage issue arrays, same "only a malformed request throws" convention every other
// apiClient function here follows; only a structurally malformed request (400) or an unknown
// targetId (404) throws.
export async function runDeployment(
    fetchImpl: FetchLike,
    targetId: string,
    modes: StudioDeploymentModeInput[],
    publish: boolean,
): Promise<StudioDeploymentRunView> {
    const response = await fetchImpl("/api/project/deployment/runs", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({targetId, modes, publish}),
    });
    if (!response.ok) {
        throw new Error(await extractErrorMessage(response, "Failed to run deployment"));
    }
    return (await response.json()) as StudioDeploymentRunView;
}

// Select/import -> Validate & analyze -> Inspect distribution/features all land in this one call — see
// StudioOutcomeLibraryService.select()'s own doc comment. Never throws for a domain-level failure (an
// unreadable path, an invalid library) — that's carried in the returned view's own "load-error"/"invalid"
// status, same convention as every other selector-driven apiClient function here.
export async function selectOutcomeLibrary(fetchImpl: FetchLike, selector: OutcomeLibrarySelector): Promise<StudioOutcomeLibrarySelectView> {
    const response = await fetchImpl("/api/project/outcome-libraries/select", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({selector}),
    });
    if (!response.ok) {
        throw new Error(await extractErrorMessage(response, "Failed to select outcome library"));
    }
    return (await response.json()) as StudioOutcomeLibrarySelectView;
}

export async function compareOutcomeLibraries(
    fetchImpl: FetchLike,
    left: OutcomeLibrarySelector,
    right: OutcomeLibrarySelector,
): Promise<StudioOutcomeLibraryCompareView> {
    const response = await fetchImpl("/api/project/outcome-libraries/compare", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({left, right}),
    });
    if (!response.ok) {
        throw new Error(await extractErrorMessage(response, "Failed to compare outcome libraries"));
    }
    return (await response.json()) as StudioOutcomeLibraryCompareView;
}

// Bundle-only deep audit (see StudioOutcomeLibraryDeepValidateView's own doc comment) — deliberately a
// separate, explicitly-triggered call, never folded into selectOutcomeLibrary.
export async function validateOutcomeLibraryDeep(fetchImpl: FetchLike, bundleDir: string, modeName: string): Promise<StudioOutcomeLibraryDeepValidateView> {
    const response = await fetchImpl("/api/project/outcome-libraries/validate-deep", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({bundleDir, modeName}),
    });
    if (!response.ok) {
        throw new Error(await extractErrorMessage(response, "Failed to deep-validate the outcome library bundle"));
    }
    return (await response.json()) as StudioOutcomeLibraryDeepValidateView;
}
