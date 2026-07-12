import type {
    GamePackageInspectionReport,
    PokieGameManifest,
    PokieGamePackageValidationReport,
    ProjectDashboardContext,
    RecentProjectEntry,
    SimulationReport,
    StudioContext,
    StudioReplayJobView,
    StudioReplayListEntry,
    StudioSimulationJobView,
    StudioSimulationReportListEntry,
} from "./types.js";

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

export async function listRecentProjects(fetchImpl: FetchLike): Promise<RecentProjectEntry[]> {
    const response = await fetchImpl("/api/recent-projects");
    return (await response.json()) as RecentProjectEntry[];
}

export async function createProject(fetchImpl: FetchLike, name: string): Promise<ProjectActionResult> {
    const response = await fetchImpl("/api/projects/create", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({name}),
    });
    if (!response.ok) {
        throw new Error(await extractErrorMessage(response, "Failed to create project"));
    }
    return (await response.json()) as ProjectActionResult;
}

export async function openProject(fetchImpl: FetchLike, projectRoot: string): Promise<ProjectActionResult> {
    const response = await fetchImpl("/api/projects/open", {
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
export async function startSimulation(fetchImpl: FetchLike, rounds: number, seed?: string): Promise<StartSimulationResult> {
    const response = await fetchImpl("/api/project/simulations", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(seed === undefined ? {rounds} : {rounds, seed}),
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

export async function getReport(fetchImpl: FetchLike, id: string): Promise<SimulationReport> {
    const response = await fetchImpl(`/api/project/reports/${encodeURIComponent(id)}`);
    if (!response.ok) {
        throw new Error(await extractErrorMessage(response, "Failed to load report"));
    }
    return (await response.json()) as SimulationReport;
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
