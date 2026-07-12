import type {
    GamePackageInspectionReport,
    PokieGameManifest,
    PokieGamePackageValidationReport,
    ProjectDashboardContext,
    RecentProjectEntry,
    StudioContext,
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
