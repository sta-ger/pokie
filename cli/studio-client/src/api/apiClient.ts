import type {
    FairnessCommitment,
    GameModelProjection,
    GamePackageInspectionReport,
    OutcomeSourceSampleView,
    PokieGameManifest,
    PokieGamePackageValidationReport,
    ProjectDashboardContext,
    StudioArtifactBuildView,
    StudioArtifactPreviewView,
    StudioArtifactTargetType,
    StudioArtifactTargetView,
    StudioBlueprintCheckView,
    StudioBlueprintLoadView,
    StudioBlueprintRandomView,
    StudioBlueprintSaveManagedView,
    StudioBlueprintSaveView,
    StudioBlueprintValidationView,
    StudioBuildPreviewView,
    StudioBuildResult,
    StudioCertificationBuildView,
    StudioCertificationSourceValidateView,
    StudioContext,
    StudioDeploymentBuildModesView,
    StudioDeploymentModeInput,
    StudioDeploymentRunView,
    StudioDeploymentTargetSummary,
    StudioFairnessConfigureView,
    StudioFairnessGenerateView,
    StudioFairnessVerifyView,
    StudioDefaultLocationView,
    StudioFsBrowseView,
    StudioHomeRecentProjectView,
    StudioNativePickerAvailabilityView,
    StudioNativePickerFileFilter,
    StudioNativePickerResultView,
    StudioOpenFolderView,
    StudioOutcomeLibraryGenerateEstimateView,
    StudioOutcomeLibraryGenerateResultView,
    StudioOutcomeLibraryRegistryView,
    StudioParSheetExportView,
    StudioParSheetImportView,
    StudioProjectImportPreviewResult,
    StudioProjectRegistrationResult,
    StudioProjectRegistryView,
    StudioReelStripGenerationView,
    StudioReplayJobView,
    StudioReplayListEntry,
    StudioRuntimeSessionView,
    StudioSimulationJobView,
    StudioSimulationReportDetail,
    StudioSimulationReportListEntry,
    StudioStakeEngineExportModeInput,
    StudioStakeEngineExportValidateView,
    StudioStakeEngineExportView,
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

// Backs the "Browse" action and PathInput's own live resolved-path hint on every filesystem-path input
// across Home *and* Project surfaces -- never throws for a domain-level failure (a nonexistent/
// unreadable/wrong-type path); the DTO's own `status` field carries that. `base`, when given (e.g. the
// currently open project's root), resolves
// `path` relative to it instead of Studio's own server root -- see StudioFsBrowseService.browse's own
// doc comment for why a project-scoped field (Certification's bundle directory, an Outcome Libraries
// selector, ...) needs this to show a truthful hint at all. `kind`, when "file", validates/resolves
// `path` as a file instead of a directory; "any" accepts either -- omitted (every navigation call, e.g.
// PathBrowseModal's own directory listing), it stays "directory", the same contract this always had.
export async function browseFilesystem(fetchImpl: FetchLike, path?: string, base?: string, kind?: "directory" | "file" | "any"): Promise<StudioFsBrowseView> {
    const params = new URLSearchParams();
    if (path && path.trim().length > 0) {
        params.set("path", path);
    }
    if (base && base.trim().length > 0) {
        params.set("base", base);
    }
    if (kind === "file" || kind === "any") {
        params.set("kind", kind);
    }
    // Checked via the serialized string, not `params.size` -- jsdom's URLSearchParams polyfill (used by
    // every studio-client test) doesn't implement `.size` at all.
    const serialized = params.toString();
    const query = serialized.length > 0 ? `?${serialized}` : "";
    const response = await fetchImpl(`/api/home/fs/browse${query}`);
    return (await response.json()) as StudioFsBrowseView;
}

// Backs PathInput's start-location precedence -- the "platform Documents, then Home" rung, after the
// field's own current value/relevant directory/remembered location have all come up empty. `name`
// opts into a Documents/POKIE/<name> suggestion for a brand-new managed project's own destination;
// every other caller omits it. Never throws for a domain-level failure, same convention as
// browseFilesystem.
export async function resolveDefaultBrowseLocation(fetchImpl: FetchLike, name?: string): Promise<StudioDefaultLocationView> {
    const query = name && name.trim().length > 0 ? `?name=${encodeURIComponent(name)}` : "";
    const response = await fetchImpl(`/api/home/fs/default-location${query}`);
    return (await response.json()) as StudioDefaultLocationView;
}

// Whether this same machine (the one running Studio's server) can show a real native OS folder/file
// dialog at all -- PathInput checks this once before every Browse click to decide whether to try the
// native picker first or go straight to the honestly-labelled PathBrowseModal fallback.
export async function checkNativePickerAvailability(fetchImpl: FetchLike): Promise<StudioNativePickerAvailabilityView> {
    const response = await fetchImpl("/api/home/fs/native-browse/availability");
    return (await response.json()) as StudioNativePickerAvailabilityView;
}

// Opens a build's own output directory in the OS file manager, on the machine running Studio's server —
// "Open output folder" on a successful Build/Rebuild. Never throws for a domain-level outcome
// (unavailable/error) — same convention as browseFilesystem/pickNativePath.
export async function openOutputFolder(fetchImpl: FetchLike, path: string): Promise<StudioOpenFolderView> {
    const response = await fetchImpl("/api/home/fs/open-folder", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({path}),
    });
    return (await response.json()) as StudioOpenFolderView;
}

export type NativeBrowseRequest = {kind: "directory" | "file"; startPath?: string; fileFilters?: StudioNativePickerFileFilter[]};

// Opens the system-native folder/file dialog on the machine running Studio's server. Never throws for a
// domain-level outcome (cancelled/unavailable/error) — StudioNativePickerResultView's own `status` field
// carries that, same convention as browseFilesystem.
export async function pickNativePath(fetchImpl: FetchLike, request: NativeBrowseRequest): Promise<StudioNativePickerResultView> {
    const response = await fetchImpl("/api/home/fs/native-browse", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(request),
    });
    return (await response.json()) as StudioNativePickerResultView;
}

// The Projects area's own managed/registered list -- every project Studio knows about, most-recently-
// registered/opened first (see StudioProjectRegistrationService.list()'s own doc comment).
export async function listProjectRegistry(fetchImpl: FetchLike): Promise<StudioProjectRegistryView[]> {
    const response = await fetchImpl("/api/home/projects/registry");
    return (await response.json()) as StudioProjectRegistryView[];
}

// Import Project's own "detect" step -- read-only, never registers anything (see
// StudioProjectRegistrationService.previewImport()'s own doc comment). Never throws for a domain-level
// outcome ("unrecognized" is an ordinary result of pointing detection at an arbitrary path) -- only a
// genuinely malformed request throws.
export async function previewProjectImport(fetchImpl: FetchLike, location: string): Promise<StudioProjectImportPreviewResult> {
    const response = await fetchImpl("/api/home/projects/registry/preview", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({location}),
    });
    if (!response.ok) {
        throw new Error(await extractErrorMessage(response, "Failed to detect the project at this location"));
    }
    return (await response.json()) as StudioProjectImportPreviewResult;
}

// Import Project's own "register" step -- always origin "external" (see
// StudioProjectRegistrationService.registerExternal()'s own doc comment). `name` defaults to the
// resolved path's own basename server-side when omitted.
export async function registerProjectImport(fetchImpl: FetchLike, location: string, name?: string): Promise<StudioProjectRegistrationResult> {
    const response = await fetchImpl("/api/home/projects/registry/register", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({location, name}),
    });
    if (!response.ok) {
        throw new Error(await extractErrorMessage(response, "Failed to register the project"));
    }
    return (await response.json()) as StudioProjectRegistrationResult;
}

export async function removeProjectRegistryEntry(fetchImpl: FetchLike, location: string): Promise<void> {
    const response = await fetchImpl("/api/home/projects/registry/remove", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({location}),
    });
    if (!response.ok) {
        throw new Error(await extractErrorMessage(response, "Failed to remove the project from the registry"));
    }
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

// Backs BlueprintEditorPage's own background source-check -- see
// StudioBlueprintService.checkSource()'s own doc comment. Never throws for "load-error" (an expected,
// safe-to-show domain outcome, e.g. the file having since been deleted) -- only a malformed request
// itself throws, same convention as every other apiClient function here.
export async function checkBlueprintSource(fetchImpl: FetchLike, path: string, blueprintHash: string): Promise<StudioBlueprintCheckView> {
    const response = await fetchImpl("/api/home/blueprints/check-source", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({path, blueprintHash}),
    });
    if (!response.ok) {
        throw new Error(await extractErrorMessage(response, "Failed to check the blueprint source"));
    }
    return (await response.json()) as StudioBlueprintCheckView;
}

export type GenerateRandomBlueprintRequest = {seed?: number; preset?: "default" | "variant"; name?: string};

// Backs the New flow's "Generate random" option — the same RandomGameBlueprintGenerator "pokie build
// random"/"pokie create --random" use, run server-side (see StudioBlueprintService.random()'s own doc
// comment). Omitting `seed` mints a fresh one each call (what "Randomize again" does); passing back a
// previously returned `seed`/`preset` reproduces that exact blueprint.
export async function generateRandomBlueprint(fetchImpl: FetchLike, request: GenerateRandomBlueprintRequest = {}): Promise<StudioBlueprintRandomView> {
    const response = await fetchImpl("/api/home/blueprints/random", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(request),
    });
    if (!response.ok) {
        throw new Error(await extractErrorMessage(response, "Failed to generate a random blueprint"));
    }
    return (await response.json()) as StudioBlueprintRandomView;
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

// The guided Design Game editor's own "first Save" -- the caller never picks a path (see
// StudioBlueprintService.saveManaged()'s own doc comment for the path Studio itself resolves). Never
// throws for a domain-level outcome ("invalid-name"/"unavailable" are ordinary results of a manifest.id
// this service can't turn into a safe directory segment, or a machine with no writable default project
// location) -- same "only a malformed request throws" convention every other apiClient function here
// follows. `sourceWorkbookPath`, when given, is the .xlsx workbook this blueprint was Applied from (see
// BlueprintEditorPage's own handleApplyImportedBlueprint) -- recorded as this freshly-created managed
// project's own provenance (see StudioProjectRegistryEntry's own doc comment), never sent for an ordinary
// "first Save" with no PAR import behind it.
export async function saveManagedBlueprint(
    fetchImpl: FetchLike,
    blueprint: unknown,
    sourceWorkbookPath?: string,
): Promise<StudioBlueprintSaveManagedView> {
    const response = await fetchImpl("/api/home/blueprints/save-managed", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({blueprint, sourceWorkbookPath}),
    });
    if (!response.ok) {
        throw new Error(await extractErrorMessage(response, "Failed to save the project"));
    }
    return (await response.json()) as StudioBlueprintSaveManagedView;
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

// Thrown by openProject on a failed Home Open Project (e.g. a Blueprint whose materialization "npm
// install" failed) -- `detail` carries the server's own raw npm diagnostic (StudioServer's "detail"
// field, alongside `message`), never folded into `message` itself, so a caller can offer it as an
// expandable technical disclosure instead of a bare thrown message losing it outright.
export class ProjectOpenError extends Error {
    public readonly detail?: string;

    constructor(message: string, detail?: string) {
        super(message);
        this.name = "ProjectOpenError";
        this.detail = detail;
    }
}

export async function openProject(fetchImpl: FetchLike, projectRoot: string): Promise<ProjectActionResult> {
    const response = await fetchImpl("/api/home/projects/open", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({projectRoot}),
    });
    if (!response.ok) {
        let body: {error?: string; detail?: string} = {};
        try {
            body = (await response.json()) as {error?: string; detail?: string};
        } catch {
            // Falls through to the generic fallback message below.
        }
        throw new ProjectOpenError(body.error ?? `Failed to open project (HTTP ${response.status}).`, body.detail);
    }
    return (await response.json()) as ProjectActionResult;
}

export async function closeProject(fetchImpl: FetchLike): Promise<StudioContext> {
    const response = await fetchImpl("/api/projects/close", {method: "POST"});
    if (!response.ok) {
        throw new Error(await extractErrorMessage(response, "Failed to close project"));
    }
    const body = (await response.json()) as {context: StudioContext};
    return body.context;
}

export async function getProjectContext(fetchImpl: FetchLike): Promise<ProjectDashboardContext> {
    const response = await fetchImpl("/api/project/context");
    return (await response.json()) as ProjectDashboardContext;
}

// Draws exactly one outcome from the currently open "outcomeLibrary" project's own `modeName` through
// the server's sampleOutcomeSourceProject() -- the same selector/session/server-backed path
// PreGeneratedSpinCommandHandler already uses in production for a native library, never loadPokieGame
// (see StudioServer.handleOutcomeSourceSample's own doc comment). Always resolves to the response body's
// own `{supported, ...}` result rather than throwing on `supported: false` -- a currently open
// "stakeAdapter" project's structured "outcomeSource.sample" capability diagnostic is an expected, honest
// outcome here, not a failed HTTP request (the route itself always answers 200 -- see that handler).
export async function sampleOutcomeSource(fetchImpl: FetchLike, modeName: string, seed?: string): Promise<OutcomeSourceSampleView> {
    const response = await fetchImpl("/api/project/outcome-source/sample", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(seed === undefined ? {modeName} : {modeName, seed}),
    });
    if (!response.ok) {
        throw new Error(await extractErrorMessage(response, "Failed to draw an outcome"));
    }
    return (await response.json()) as OutcomeSourceSampleView;
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

// Backs the Project Workspace's own Game Model tab -- see buildProjectGameModel's own doc comment for
// the resolved-project-type dispatch this reads (blueprint / outcomeLibrary+stakeAdapter / wasm /
// tsPackage-default). Always resolves to a full GameModelProjection, never throws for a domain-level
// "unavailable" section -- only a genuinely failed request throws. `sharedWeightsSampleSeed` backs the
// Game Model Reels view's own "New sample" action for a "symbolWeights"/"default" blueprint (see
// GameModelSharedWeightsSample's own doc comment) -- omitted for the default, reproducible sample.
export async function getGameModel(fetchImpl: FetchLike, sharedWeightsSampleSeed?: number): Promise<GameModelProjection> {
    const query = sharedWeightsSampleSeed !== undefined ? `?sharedWeightsSampleSeed=${sharedWeightsSampleSeed}` : "";
    const response = await fetchImpl(`/api/project/gameModel${query}`);
    if (!response.ok) {
        throw new Error(await extractErrorMessage(response, "Failed to load the game model"));
    }
    return (await response.json()) as GameModelProjection;
}

// The guided Design Game editor's own live Game Model preview -- see StudioBlueprintService.
// previewGameModel()'s own doc comment. Never writes/reads anything on disk, and never throws for a
// structurally incomplete draft -- that comes back as an ordinary "unavailable" projection instead.
// `sharedWeightsSampleSeed` -- see getGameModel's own doc comment above.
export async function previewGameModel(fetchImpl: FetchLike, blueprint: unknown, sharedWeightsSampleSeed?: number): Promise<GameModelProjection> {
    const response = await fetchImpl("/api/home/blueprints/game-model-preview", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({blueprint, sharedWeightsSampleSeed}),
    });
    if (!response.ok) {
        throw new Error(await extractErrorMessage(response, "Failed to preview the game model"));
    }
    return (await response.json()) as GameModelProjection;
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
    modeName?: string,
): Promise<StartSimulationResult> {
    const response = await fetchImpl("/api/project/simulations", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
            rounds,
            ...(seed === undefined ? {} : {seed}),
            ...(workers === undefined ? {} : {workers}),
            ...(modeName === undefined ? {} : {modeName}),
        }),
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
export async function runReplay(
    fetchImpl: FetchLike,
    round: number,
    seed?: string,
    simulationId?: string,
    modeName?: string,
): Promise<StartReplayResult> {
    const response = await fetchImpl("/api/project/replays", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
            round,
            ...(seed !== undefined ? {seed} : {}),
            ...(simulationId !== undefined ? {simulationId} : {}),
            ...(modeName !== undefined ? {modeName} : {}),
        }),
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

// Replay & Debug's "Session Spin" find method — Studio's own bounded (last 20) in-memory record of
// recent spins (see StudioRoundRecorder.list()), most-recent-first. Always a 200 with possibly an empty
// array (nothing spun yet, debug mode was off, or the project was since switched) — never an error for
// "nothing to show".
export async function listRecentSpins(fetchImpl: FetchLike): Promise<StudioRuntimeSessionView[]> {
    const response = await fetchImpl("/api/project/rounds");
    if (!response.ok) {
        throw new Error(await extractErrorMessage(response, "Failed to list recent spins"));
    }
    return (await response.json()) as StudioRuntimeSessionView[];
}

export type PlaySessionResult = {status: "ok"; session: StudioRuntimeSessionView} | {status: "error"; message: string} | {status: "no-active-project"};

export type PlaySpinResult =
    | {status: "ok"; session: StudioRuntimeSessionView}
    | {status: "error"; message: string}
    | {status: "not-found"}
    | {status: "blocked"; message: string}
    | {status: "no-active-project"};

// Play's own two calls -- POST /api/project/play/session, POST /api/project/play/sessions/:id/spin --
// Studio's own API, never PokieDevServer's own HTTP contract (see StudioPlayService's own doc comment).
// Every outcome is a typed result, never thrown -- "no-active-project" is the one precondition this
// route actually has (a project being open at all).
export async function createPlaySession(fetchImpl: FetchLike, seed?: string | number, modeName?: string): Promise<PlaySessionResult> {
    const requestBody: Record<string, unknown> = {};
    if (seed !== undefined) {
        requestBody.seed = seed;
    }
    if (modeName !== undefined) {
        requestBody.modeName = modeName;
    }
    const response = await fetchImpl("/api/project/play/session", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(requestBody),
    });
    if (response.status === 409) {
        return {status: "no-active-project"};
    }
    if (!response.ok) {
        throw new Error(await extractErrorMessage(response, "Failed to create a play session"));
    }
    const body = (await response.json()) as {status: "ok"; session: StudioRuntimeSessionView} | {status: "failed"; error: string};
    if (body.status === "ok") {
        return {status: "ok", session: body.session};
    }
    return {status: "error", message: body.error};
}

export async function spinPlaySession(fetchImpl: FetchLike, sessionId: string): Promise<PlaySpinResult> {
    const response = await fetchImpl(`/api/project/play/sessions/${encodeURIComponent(sessionId)}/spin`, {method: "POST"});
    return readPlaySpinResult(response);
}

// PlayTab's "Find any win" scenario control -- POST .../find-any-win, no body. Returns the exact same
// PlaySpinResult shape spinPlaySession does (see StudioPlayService.findAnyWin()'s own doc comment: it's
// the same authoritative spin() path underneath, just repeated server-side until a round actually wins),
// so PlayTab renders whatever round comes back through the identical RoundSummary chain a plain Spin does.
export async function findAnyWinPlaySession(fetchImpl: FetchLike, sessionId: string): Promise<PlaySpinResult> {
    const response = await fetchImpl(`/api/project/play/sessions/${encodeURIComponent(sessionId)}/find-any-win`, {method: "POST"});
    return readPlaySpinResult(response);
}

// PlayTab's "Find symbol win" scenario control -- POST .../find-symbol-win, body `{symbolId}` -- the
// chooser's own currently-selected symbol, propagated straight through to the server (see
// StudioPlayService.findSymbolWin()'s own doc comment).
export async function findSymbolWinPlaySession(fetchImpl: FetchLike, sessionId: string, symbolId: string): Promise<PlaySpinResult> {
    const response = await fetchImpl(`/api/project/play/sessions/${encodeURIComponent(sessionId)}/find-symbol-win`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({symbolId}),
    });
    return readPlaySpinResult(response);
}

async function readPlaySpinResult(response: {status: number; ok: boolean; json(): Promise<unknown>}): Promise<PlaySpinResult> {
    if (response.status === 409) {
        return {status: "no-active-project"};
    }
    if (response.status === 404) {
        return {status: "not-found"};
    }
    if (response.status === 400) {
        const body = (await response.json()) as {error: string};
        return {status: "blocked", message: body.error};
    }
    if (!response.ok) {
        throw new Error(await extractErrorMessage(response, "Failed to spin"));
    }
    const body = (await response.json()) as {status: "ok"; session: StudioRuntimeSessionView} | {status: "error"; error: string};
    if (body.status === "ok") {
        return {status: "ok", session: body.session};
    }
    return {status: "error", message: body.error};
}

export async function listDeploymentTargets(fetchImpl: FetchLike): Promise<StudioDeploymentTargetSummary[]> {
    const response = await fetchImpl("/api/project/deployment/targets");
    if (!response.ok) {
        throw new Error(await extractErrorMessage(response, "Failed to fetch deployment targets"));
    }
    return (await response.json()) as StudioDeploymentTargetSummary[];
}

// The Configure step's own mode picker's data source — see
// cli/studio/deployment/StudioDeploymentBuildModesView.ts's own doc comment: resolved server-side from
// the project's own current *built* package, so editing, moving, or deleting the tracked source after a
// build never changes what Configure offers to pick from.
export async function getDeploymentBuildModes(fetchImpl: FetchLike): Promise<StudioDeploymentBuildModesView> {
    const response = await fetchImpl("/api/project/deployment/build-modes");
    if (!response.ok) {
        throw new Error(await extractErrorMessage(response, "Failed to fetch the project's current build modes"));
    }
    return (await response.json()) as StudioDeploymentBuildModesView;
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

// The Generate step's own "how big is this?" preflight -- see StudioOutcomeLibraryGenerateEstimateView's
// own doc comment. `maxOutcomeSpaceSize` is a decimal string (same bigint-safe convention as the CLI's own
// --max-outcome-space-size), never a plain `number` -- a raw reel-stop combination count routinely exceeds
// Number.MAX_SAFE_INTEGER.
export async function estimateOutcomeLibraryGeneration(fetchImpl: FetchLike, mode?: string, maxOutcomeSpaceSize?: string): Promise<StudioOutcomeLibraryGenerateEstimateView> {
    const response = await fetchImpl("/api/project/outcome-libraries/generate/estimate", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({mode, maxOutcomeSpaceSize}),
    });
    if (!response.ok) {
        throw new Error(await extractErrorMessage(response, "Failed to estimate the outcome library generation"));
    }
    return (await response.json()) as StudioOutcomeLibraryGenerateEstimateView;
}

// The Generate step's own request options -- mirrors "pokie outcomelibrary generate"'s own flags (see
// OutcomeLibraryCommand's GenerateCliOptions), never a parallel vocabulary. sampleSize is a decimal string,
// same reasoning as maxOutcomeSpaceSize above.
export type OutcomeLibraryGenerateRequestOptions = {
    mode?: string;
    stake?: number;
    configHash?: string;
    libraryId?: string;
    maxOutcomeSpaceSize?: string;
    bounded?: {sampleSize: string; seed: string};
    outDir?: string;
};

// Drives generateExactWeightedOutcomeLibrary against the current project's own built package -- the exact
// same public generation service "pokie outcomelibrary generate" itself calls -- then writes the result
// straight into the project's own outcome-library bundle (see StudioOutcomeLibraryGenerateService.generate's
// own doc comment). Never throws for a domain-level failure (unsupported package, generation error, invalid
// write) -- that's carried in the returned view's own status, same convention as every other
// outcome-library apiClient function here.
export async function generateOutcomeLibrary(fetchImpl: FetchLike, options: OutcomeLibraryGenerateRequestOptions): Promise<StudioOutcomeLibraryGenerateResultView> {
    const response = await fetchImpl("/api/project/outcome-libraries/generate", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(options),
    });
    if (!response.ok) {
        throw new Error(await extractErrorMessage(response, "Failed to generate the outcome library"));
    }
    return (await response.json()) as StudioOutcomeLibraryGenerateResultView;
}

// The Registry panel's own "does a compatible library already exist for this build?" check -- see
// StudioOutcomeLibraryRegistryView's own doc comment.
export async function getOutcomeLibraryRegistry(fetchImpl: FetchLike): Promise<StudioOutcomeLibraryRegistryView> {
    const response = await fetchImpl("/api/project/outcome-libraries/registry");
    if (!response.ok) {
        throw new Error(await extractErrorMessage(response, "Failed to fetch the outcome library registry"));
    }
    return (await response.json()) as StudioOutcomeLibraryRegistryView;
}

// The Certification tab's own preflight (see StudioCertificationSourceValidateView) — the exact same
// deep bundle validation the Build step's own builder runs internally, exposed here so it can be run
// (and inspected) before committing to a build.
export async function validateCertificationSourceBundle(fetchImpl: FetchLike, bundleDir: string): Promise<StudioCertificationSourceValidateView> {
    const response = await fetchImpl("/api/project/certification/validate-source", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({bundleDir}),
    });
    if (!response.ok) {
        throw new Error(await extractErrorMessage(response, "Failed to validate the source outcome-library bundle"));
    }
    return (await response.json()) as StudioCertificationSourceValidateView;
}

export type CertificationBuildModeInput = {modeName: string; seed: string; sampleCount: number};

export async function buildCertificationEvidenceBundle(
    fetchImpl: FetchLike,
    bundleDir: string,
    modes: CertificationBuildModeInput[],
    outDir: string,
): Promise<StudioCertificationBuildView> {
    const response = await fetchImpl("/api/project/certification/build", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({bundleDir, modes, outDir}),
    });
    if (!response.ok) {
        throw new Error(await extractErrorMessage(response, "Failed to build the certification/evidence bundle"));
    }
    return (await response.json()) as StudioCertificationBuildView;
}

// The Provably Fair tab's "Configure" step (see StudioFairnessConfigureView) — computes both
// commit-reveal artifacts a real round would publish in sequence, against the live bundle's own
// libraryId/libraryHash for the requested mode.
export async function configureFairnessRound(
    fetchImpl: FetchLike,
    request: {bundleDir: string; modeName: string; serverSeed: string; clientSeed: string; nonce: number},
): Promise<StudioFairnessConfigureView> {
    const response = await fetchImpl("/api/project/fairness/configure", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(request),
    });
    if (!response.ok) {
        throw new Error(await extractErrorMessage(response, "Failed to configure the Provably Fair round"));
    }
    return (await response.json()) as StudioFairnessConfigureView;
}

export async function generateFairnessProof(
    fetchImpl: FetchLike,
    bundleDir: string,
    commitment: FairnessCommitment,
    serverSeed: string,
): Promise<StudioFairnessGenerateView> {
    const response = await fetchImpl("/api/project/fairness/generate", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({bundleDir, commitment, serverSeed}),
    });
    if (!response.ok) {
        throw new Error(await extractErrorMessage(response, "Failed to generate the Provably Fair round proof"));
    }
    return (await response.json()) as StudioFairnessGenerateView;
}

// `proof`/`commitment` are `unknown` at the wire level (a pasted external proof/commitment is exactly
// as valid an input as one generated in this same session) -- FairnessRoundProofVerifier itself
// validates both structurally and never throws, so nothing here narrows their shape either.
export async function verifyFairnessProof(
    fetchImpl: FetchLike,
    proof: unknown,
    commitment: unknown,
    sourceBundleDir: string | undefined,
): Promise<StudioFairnessVerifyView> {
    const response = await fetchImpl("/api/project/fairness/verify", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({proof, commitment, sourceBundleDir}),
    });
    if (!response.ok) {
        throw new Error(await extractErrorMessage(response, "Failed to verify the Provably Fair round proof"));
    }
    return (await response.json()) as StudioFairnessVerifyView;
}

// The Stake Engine Export tab's "Validate diagnostics" step -- the exact same structural/representability
// validation StakeEngineExporter itself runs (and aborts the whole export on) before writing a single
// file, exposed here so it can be run (and inspected) before committing to Export.
export async function validateStakeEngineExport(
    fetchImpl: FetchLike,
    modes: StudioStakeEngineExportModeInput[],
): Promise<StudioStakeEngineExportValidateView> {
    const response = await fetchImpl("/api/project/stakeengine/validate", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({modes}),
    });
    if (!response.ok) {
        throw new Error(await extractErrorMessage(response, "Failed to validate the Stake Engine export"));
    }
    return (await response.json()) as StudioStakeEngineExportValidateView;
}

// "conflict" (409, a pre-existing non-empty outDir) is a normal parsed result, not a thrown error -- same
// convention as saveBlueprint/exportParSheet above, since it's something the caller can resolve by
// resubmitting with `overwrite: true`, not a failed request.
export async function exportStakeEngine(
    fetchImpl: FetchLike,
    modes: StudioStakeEngineExportModeInput[],
    outDir: string,
    overwrite: boolean,
): Promise<StudioStakeEngineExportView> {
    const response = await fetchImpl("/api/project/stakeengine/export", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({modes, outDir, overwrite}),
    });
    if (response.status === 409) {
        return (await response.json()) as StudioStakeEngineExportView;
    }
    if (!response.ok) {
        throw new Error(await extractErrorMessage(response, "Failed to export to Stake Engine"));
    }
    return (await response.json()) as StudioStakeEngineExportView;
}

// The Build/Export tab's own "Build artifact" group -- every ArtifactBuilderRegistry target, each already
// marked `supported` against the active project's own resolved ProjectType (see
// StudioArtifactBuildService.listTargets's own doc comment).
export async function listArtifactTargets(fetchImpl: FetchLike): Promise<StudioArtifactTargetView[]> {
    const response = await fetchImpl("/api/project/artifacts/targets");
    if (!response.ok) {
        throw new Error(await extractErrorMessage(response, "Failed to load the build artifact target list"));
    }
    return (await response.json()) as StudioArtifactTargetView[];
}

// Reports what building `target` against the active project would do -- the same registry-resolved
// destination/capability/conflict diagnostics buildArtifact() below would report, without ever writing
// anything. "unsupported" and "conflict" are both normal parsed results (never thrown), same convention as
// buildArtifact below.
export async function previewArtifact(fetchImpl: FetchLike, target: StudioArtifactTargetType, outDir?: string): Promise<StudioArtifactPreviewView> {
    const response = await fetchImpl("/api/project/artifacts/preview", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({target, outDir}),
    });
    if (!response.ok && response.status !== 409) {
        throw new Error(await extractErrorMessage(response, "Failed to preview the artifact build"));
    }
    return (await response.json()) as StudioArtifactPreviewView;
}

// Runs the active project through ArtifactBuilderRegistry directly, the exact same
// "pokie build <project> --target <target>" pipeline. "unsupported" and "conflict" are both normal parsed
// results (never thrown) -- same convention as exportStakeEngine above.
export async function buildArtifact(fetchImpl: FetchLike, target: StudioArtifactTargetType, outDir?: string): Promise<StudioArtifactBuildView> {
    const response = await fetchImpl("/api/project/artifacts/build", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({target, outDir}),
    });
    if (!response.ok && response.status !== 409) {
        throw new Error(await extractErrorMessage(response, "Failed to build the artifact"));
    }
    return (await response.json()) as StudioArtifactBuildView;
}
