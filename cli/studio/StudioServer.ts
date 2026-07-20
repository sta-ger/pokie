import {
    GamePackageInspecting,
    GamePackageInspector,
    loadPokieGame,
    PokieDevServerAddress,
    PokieGamePackageValidating,
    PokieGamePackageValidator,
    RoundArtifactValidator,
} from "pokie";
import fs from "fs";
import http, {IncomingMessage, ServerResponse} from "http";
import path from "path";
import {StudioBlueprintService} from "./blueprint/StudioBlueprintService.js";
import {validateApplyProjectBlueprintRequest, ApplyProjectBlueprintRequestInput} from "./blueprint/validateApplyProjectBlueprintRequest.js";
import {validateBlueprintBuildRequest, BlueprintBuildRequestInput} from "./blueprint/validateBlueprintBuildRequest.js";
import {validateBlueprintValidationRequest, BlueprintValidationRequestInput} from "./blueprint/validateBlueprintValidationRequest.js";
import {validateLoadBlueprintRequest, LoadBlueprintRequestInput} from "./blueprint/validateLoadBlueprintRequest.js";
import {validateParSheetExportRequest, ParSheetExportRequestInput} from "./blueprint/validateParSheetExportRequest.js";
import {validateParSheetImportRequest, ParSheetImportRequestInput} from "./blueprint/validateParSheetImportRequest.js";
import {validateSaveBlueprintRequest, SaveBlueprintRequestInput} from "./blueprint/validateSaveBlueprintRequest.js";
import {StudioCertificationService} from "./certification/StudioCertificationService.js";
import {validateCertificationBuildRequest, CertificationBuildRequestInput} from "./certification/validateCertificationBuildRequest.js";
import {
    validateCertificationSourceValidateRequest,
    CertificationSourceValidateRequestInput,
} from "./certification/validateCertificationSourceValidateRequest.js";
import {StudioDeploymentService} from "./deployment/StudioDeploymentService.js";
import {validateDeploymentRunRequest, DeploymentRunRequestInput} from "./deployment/validateDeploymentRunRequest.js";
import {StudioFairnessService} from "./fairness/StudioFairnessService.js";
import {validateFairnessConfigureRequest, FairnessConfigureRequestInput} from "./fairness/validateFairnessConfigureRequest.js";
import {validateFairnessGenerateRequest, FairnessGenerateRequestInput} from "./fairness/validateFairnessGenerateRequest.js";
import {validateFairnessVerifyRequest, FairnessVerifyRequestInput} from "./fairness/validateFairnessVerifyRequest.js";
import {StudioHomeService} from "./home/StudioHomeService.js";
import {StudioOutcomeLibraryService} from "./outcomeLibrary/StudioOutcomeLibraryService.js";
import {validateOutcomeLibrarySelectRequest, OutcomeLibrarySelectRequestInput} from "./outcomeLibrary/validateOutcomeLibrarySelectRequest.js";
import {validateOutcomeLibraryCompareRequest, OutcomeLibraryCompareRequestInput} from "./outcomeLibrary/validateOutcomeLibraryCompareRequest.js";
import {
    validateOutcomeLibraryDeepValidateRequest,
    OutcomeLibraryDeepValidateRequestInput,
} from "./outcomeLibrary/validateOutcomeLibraryDeepValidateRequest.js";
import type {StudioDiagnosticsView} from "./StudioDiagnosticsView.js";
import {validateBuildRequest, BuildRequestInput} from "./home/validateBuildRequest.js";
import {validateCreateProjectRequest, CreateProjectRequestInput} from "./home/validateCreateProjectRequest.js";
import {validateInitProjectRequest, InitProjectRequestInput} from "./home/validateInitProjectRequest.js";
import {validateOpenProjectRequest, OpenProjectRequestInput} from "./home/validateOpenProjectRequest.js";
import {loadProjectDashboardContext} from "./loadProjectDashboardContext.js";
import type {ProjectDashboardContext} from "./ProjectDashboardContext.js";
import {isPathWithin} from "./isPathWithin.js";
import {buildReplayDownload} from "./replay/buildReplayDownload.js";
import {StudioReplayExecutionService} from "./replay/StudioReplayExecutionService.js";
import type {StudioReplayStatus} from "./replay/StudioReplayStatus.js";
import {validateReplayRequest, ReplayRequestInput} from "./replay/validateReplayRequest.js";
import {StudioRuntimeManager, StudioRuntimeSessionResult, StudioRuntimeSpinResult, StudioRuntimeStartResult} from "./runtime/StudioRuntimeManager.js";
import {validateRuntimeSessionRequest, RuntimeSessionRequestInput} from "./runtime/validateRuntimeSessionRequest.js";
import {validateRuntimeSpinRequest, RuntimeSpinRequestInput} from "./runtime/validateRuntimeSpinRequest.js";
import {validateStartRuntimeRequest, StartRuntimeRequestInput, ValidatedStartRuntimeRequest} from "./runtime/validateStartRuntimeRequest.js";
import {buildSimulationReportDownload, isReportDownloadFormat} from "./simulation/buildSimulationReportDownload.js";
import {StudioSimulationService} from "./simulation/StudioSimulationService.js";
import type {StudioSimulationReportDetail} from "./simulation/StudioSimulationJobView.js";
import type {StudioSimulationStatus} from "./simulation/StudioSimulationStatus.js";
import {validateSimulationRequest, SimulationRequestInput} from "./simulation/validateSimulationRequest.js";
import type {StudioContext} from "./StudioContext.js";
import type {StudioServerHandling} from "./StudioServerHandling.js";
import type {StudioServerOptions} from "./StudioServerOptions.js";
import type {StudioToolHandling} from "./StudioToolHandling.js";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 3200;

const CONTENT_TYPES: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
};

// The first minimal stage of POKIE Studio (see docs/cli.md): serves the studio-client app shell
// (built from cli/studio-client) plus a small same-origin JSON API. Unlike PokieDevServer/
// PokieClientServer (deliberately two separate origins for the dev/reference workflow), Studio's
// frontend and API share one server/origin — there's no split-origin CORS need here.
//
// Holds exactly one mutable `currentContext` for the lifetime of the process: a single Studio
// instance models one active local session, same single-user-local-tool assumption as
// PokieDevServer's own session/wallet state. Create/Open switch it to "project"; Close resets it to
// "home". This is intentionally not multi-tenant — a shared/remote Studio is out of scope, see
// docs/cli.md.
//
// The Project Dashboard (GET /api/project/context, /api/project/inspect, /api/project/validate) is
// the first real Project-mode feature built on top of that stub — see docs/cli.md. It reuses
// GamePackageInspecting/PokieGamePackageValidating exactly as `pokie inspect`/`pokie validate` do,
// and loadPokieGame exactly as Open Project already did — no business logic is duplicated, and no
// CLI command is ever spawned as a subprocess.
export class StudioServer implements StudioServerHandling {
    private readonly host: string;
    private readonly port: number;
    private readonly pokieVersion: string;
    private readonly studioRoot: string;
    private readonly homeService: StudioHomeService;
    private readonly blueprintService: StudioBlueprintService;
    private readonly loadGame: typeof loadPokieGame;
    private readonly gamePackageInspector: GamePackageInspecting;
    private readonly gamePackageValidator: PokieGamePackageValidating;
    private readonly simulationService: StudioSimulationService;
    private readonly replayService: StudioReplayExecutionService;
    private readonly runtimeManager: StudioRuntimeManager;
    private readonly deploymentService: StudioDeploymentService;
    private readonly outcomeLibraryService: StudioOutcomeLibraryService;
    private readonly certificationService: StudioCertificationService;
    private readonly fairnessService: StudioFairnessService;
    private readonly toolHandlers: StudioToolHandling[];
    private currentContext: StudioContext;
    // undefined exactly when currentContext.mode === "home" — kept as a separate field (rather than
    // folded into StudioContext) since StudioContext is also returned synchronously by
    // create/open/close, while this can lag behind briefly after startup (see start()'s background
    // load for `pokie .`/`pokie <path>`).
    private projectDashboard: ProjectDashboardContext | undefined;
    private server: http.Server | undefined;

    constructor(options: StudioServerOptions) {
        this.host = options.host ?? DEFAULT_HOST;
        this.port = options.port ?? DEFAULT_PORT;
        this.pokieVersion = options.pokieVersion;
        this.studioRoot = path.resolve(options.studioRoot);
        this.homeService = options.homeService;
        this.blueprintService = options.blueprintService;
        this.loadGame = options.loadGame ?? loadPokieGame;
        this.gamePackageInspector = options.gamePackageInspector ?? new GamePackageInspector();
        this.gamePackageValidator = options.gamePackageValidator ?? new PokieGamePackageValidator();
        this.simulationService = options.simulationService ?? new StudioSimulationService(undefined, this.loadGame);
        this.replayService = options.replayService ?? new StudioReplayExecutionService(undefined, this.loadGame, undefined, undefined, undefined, undefined, this.pokieVersion);
        this.runtimeManager = options.runtimeManager ?? new StudioRuntimeManager(this.loadGame);
        this.deploymentService = options.deploymentService ?? new StudioDeploymentService();
        this.outcomeLibraryService = options.outcomeLibraryService ?? new StudioOutcomeLibraryService();
        this.certificationService = options.certificationService ?? new StudioCertificationService(this.pokieVersion);
        this.fairnessService = options.fairnessService ?? new StudioFairnessService();
        this.toolHandlers = options.toolHandlers ?? [];
        this.currentContext = options.initialContext ?? {mode: "home"};
    }

    public start(): Promise<PokieDevServerAddress> {
        return new Promise((resolve, reject) => {
            const server = http.createServer((req, res) => {
                this.handleRequest(req, res).catch((error) => {
                    this.sendJson(res, 500, {error: error instanceof Error ? error.message : String(error)});
                });
            });
            server.once("error", reject);
            server.listen(this.port, this.host, () => {
                const address = server.address();
                if (address === null || typeof address === "string") {
                    reject(new Error("Failed to determine the studio server's bound address."));
                    return;
                }
                this.server = server;
                // Deliberately not awaited: the HTTP server must be reachable immediately (the
                // browser opens right away — see StudioCommand), not block on loading the entry
                // module. GET /api/project/context reports "loading" for the brief window until this
                // settles into "loaded"/"error" — see loadProjectDashboardContext.
                if (this.currentContext.mode === "project") {
                    this.startProjectDashboardLoad(this.currentContext.projectRoot);
                }
                resolve({host: this.host, port: address.port});
            });
        });
    }

    public async stop(): Promise<void> {
        // Best-effort, synchronous, before anything else: a simulation's/replay's chunked run loop
        // (see StudioSimulationService.run()/StudioReplayExecutionService.run()) is scheduled
        // independently of any HTTP connection, so closing the server alone would leave either running
        // against an event loop nobody is serving requests on anymore.
        this.simulationService.cancelAll();
        this.replayService.cancelAll();
        // Unlike the two above, a runtime server genuinely holds an OS port — awaited so it's released
        // before this method resolves, not left listening after Studio itself has shut down.
        await this.runtimeManager.stopForShutdown();
        return new Promise((resolve, reject) => {
            if (!this.server) {
                resolve();
                return;
            }
            this.server.close((error) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve();
            });
        });
    }

    // Called from both project-switch points (handleHomeOpenProject, /api/projects/close) *before*
    // this.currentContext is mutated — a no-op unless currentContext is still "project" at the time of
    // the call. Unlike StudioRuntimeManager (which holds an OS port and is always torn down on switch),
    // StudioSimulationService/StudioReplayExecutionService jobs are otherwise only ever stopped on full
    // Studio shutdown (see stop() above) — they're scoped by projectRoot so a job for a project you've
    // switched away from is never *reachable* through this project's own routes again, but "unreachable"
    // isn't "stopped": without this, its chunk loop would keep running in the background indefinitely,
    // wasting CPU for a result nothing can ever read.
    private cancelActiveJobsForOldProject(): void {
        if (this.currentContext.mode !== "project") {
            return;
        }
        this.simulationService.cancelActiveForProject(this.currentContext.projectRoot);
        this.replayService.cancelActiveForProject(this.currentContext.projectRoot);
    }

    // Every field is a primitive already safe to expose — no stack traces, env vars, tokens, or service
    // instances: studioVersion/nodeVersion/uptimeSeconds are ordinary version/process facts, mode/
    // projectRoot/runtimeStatus mirror what /api/context and the Runtime tab already return to the
    // client, the two active-job counts are plain numbers (see StudioSimulationService/
    // StudioReplayExecutionService's own getActiveCount()), and recentProjectStoragePath is a fixed
    // literal describing InMemoryRecentProjectsRepository's actual (non-persistent) storage — never a
    // real filesystem path, since there isn't one.
    private buildDiagnostics(): StudioDiagnosticsView {
        return {
            studioVersion: this.pokieVersion,
            nodeVersion: process.version,
            mode: this.currentContext.mode,
            projectRoot: this.currentContext.mode === "project" ? this.currentContext.projectRoot : undefined,
            activeSimulationCount: this.simulationService.getActiveCount(),
            activeReplayCount: this.replayService.getActiveCount(),
            runtimeStatus: this.runtimeManager.getState().status,
            recentProjectStoragePath: "in-memory (no persistent path)",
            uptimeSeconds: process.uptime(),
        };
    }

    private startProjectDashboardLoad(projectRoot: string): void {
        this.projectDashboard = {status: "loading", projectRoot};
        loadProjectDashboardContext(projectRoot, this.loadGame)
            .then((dashboard) => {
                this.projectDashboard = dashboard;
            })
            .catch(() => {
                // loadProjectDashboardContext itself never rejects (it catches internally) — this is
                // an extra safety net only, so a StudioServer never crashes on a background load.
            });
    }

    private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
        const method = req.method ?? "GET";
        const url = new URL(req.url ?? "/", "http://localhost");

        if (method === "GET" && url.pathname === "/api/health") {
            this.sendJson(res, 200, {status: "ok"});
            return;
        }

        if (method === "GET" && url.pathname === "/api/context") {
            this.sendJson(res, 200, this.currentContext);
            return;
        }

        if (method === "GET" && url.pathname === "/api/studio/diagnostics") {
            this.sendJson(res, 200, this.buildDiagnostics());
            return;
        }

        if (method === "GET" && url.pathname === "/api/home/recent-projects") {
            this.sendJson(res, 200, await this.homeService.listRecentProjects());
            return;
        }

        if (method === "POST" && url.pathname === "/api/home/projects/create") {
            await this.handleHomeCreateProject(req, res);
            return;
        }

        if (method === "POST" && url.pathname === "/api/home/projects/init") {
            await this.handleHomeInitProject(req, res);
            return;
        }

        if (method === "POST" && url.pathname === "/api/home/projects/build/preview") {
            await this.handleHomeBuildPreview(req, res);
            return;
        }

        if (method === "POST" && url.pathname === "/api/home/projects/build") {
            await this.handleHomeBuildProject(req, res);
            return;
        }

        if (method === "POST" && url.pathname === "/api/home/projects/open") {
            await this.handleHomeOpenProject(req, res);
            return;
        }

        if (method === "POST" && url.pathname === "/api/home/blueprints/validate") {
            await this.handleBlueprintValidate(req, res);
            return;
        }

        if (method === "POST" && url.pathname === "/api/home/blueprints/load") {
            await this.handleBlueprintLoad(req, res);
            return;
        }

        if (method === "POST" && url.pathname === "/api/home/blueprints/save") {
            await this.handleBlueprintSave(req, res);
            return;
        }

        if (method === "POST" && url.pathname === "/api/home/blueprints/build-preview") {
            await this.handleBlueprintBuildPreview(req, res);
            return;
        }

        if (method === "POST" && url.pathname === "/api/home/blueprints/reel-strip-generation-preview") {
            await this.handleBlueprintReelStripGenerationPreview(req, res);
            return;
        }

        if (method === "POST" && url.pathname === "/api/home/blueprints/par-import") {
            await this.handleBlueprintParImport(req, res);
            return;
        }

        if (method === "POST" && url.pathname === "/api/home/blueprints/par-export") {
            await this.handleBlueprintParExport(req, res);
            return;
        }

        if (method === "POST" && url.pathname === "/api/home/blueprints/build") {
            await this.handleBlueprintBuild(req, res);
            return;
        }

        if (method === "POST" && url.pathname === "/api/projects/close") {
            // Awaited before the context actually flips to "home": a runtime server belongs to the
            // project being left and holds an OS port, so it must be fully torn down here rather than
            // left running unseen (see StudioRuntimeManager's own doc comment). Simulation/Replay jobs
            // for that same project are cancelled too — see cancelActiveJobsForOldProject()'s own doc
            // comment for why this can't just rely on their existing projectRoot scoping alone.
            await this.runtimeManager.stopForProjectSwitch();
            this.cancelActiveJobsForOldProject();
            this.currentContext = {mode: "home"};
            this.projectDashboard = undefined;
            this.sendJson(res, 200, {context: this.currentContext});
            return;
        }

        if (method === "GET" && url.pathname === "/api/project/context") {
            this.sendJson(res, 200, this.projectDashboard ?? {status: "empty"});
            return;
        }

        if (method === "GET" && url.pathname === "/api/project/inspect") {
            this.handleInspectProject(res);
            return;
        }

        if (method === "GET" && url.pathname === "/api/project/validate") {
            await this.handleValidateProject(res);
            return;
        }

        if (method === "POST" && url.pathname === "/api/project/simulations") {
            await this.handleStartSimulation(req, res);
            return;
        }

        const simulationId = this.matchSimulationRoute(url.pathname);
        if (simulationId !== undefined && method === "GET") {
            this.handleGetSimulation(res, simulationId);
            return;
        }
        if (simulationId !== undefined && method === "DELETE") {
            this.handleCancelSimulation(res, simulationId);
            return;
        }

        if (method === "GET" && url.pathname === "/api/project/reports") {
            this.handleListReports(res);
            return;
        }

        const reportRoute = this.matchReportRoute(url.pathname);
        if (reportRoute !== undefined && method === "GET") {
            if (reportRoute.download) {
                this.handleDownloadReport(res, reportRoute.id, url);
            } else {
                this.handleGetReport(res, reportRoute.id);
            }
            return;
        }

        if (method === "POST" && url.pathname === "/api/project/replays") {
            await this.handleStartReplay(req, res);
            return;
        }

        if (method === "GET" && url.pathname === "/api/project/replays") {
            this.handleListReplays(res);
            return;
        }

        if (method === "POST" && url.pathname === "/api/project/replays/inspect-artifact") {
            await this.handleInspectReplayArtifact(req, res);
            return;
        }

        const replayRoute = this.matchReplayRoute(url.pathname);
        if (replayRoute !== undefined && method === "GET") {
            if (replayRoute.download) {
                this.handleDownloadReplay(res, replayRoute.id);
            } else {
                this.handleGetReplay(res, replayRoute.id);
            }
            return;
        }
        if (replayRoute !== undefined && !replayRoute.download && method === "DELETE") {
            this.handleCancelReplay(res, replayRoute.id);
            return;
        }

        if (method === "GET" && url.pathname === "/api/project/runtime") {
            this.handleGetRuntime(res);
            return;
        }

        if (method === "GET" && url.pathname === "/api/project/runtime/spins") {
            this.handleListRecentSpins(res);
            return;
        }

        if (method === "POST" && url.pathname === "/api/project/runtime/start") {
            await this.handleRuntimeStart(req, res);
            return;
        }

        if (method === "POST" && url.pathname === "/api/project/runtime/stop") {
            await this.handleRuntimeStop(res);
            return;
        }

        if (method === "POST" && url.pathname === "/api/project/runtime/restart") {
            await this.handleRuntimeRestart(req, res);
            return;
        }

        if (method === "POST" && url.pathname === "/api/project/runtime/sessions") {
            await this.handleRuntimeCreateSession(req, res);
            return;
        }

        const runtimeSpinSessionId = this.matchRuntimeSpinRoute(url.pathname);
        if (runtimeSpinSessionId !== undefined && method === "POST") {
            await this.handleRuntimeSpin(req, res, runtimeSpinSessionId);
            return;
        }

        const runtimeSessionId = this.matchRuntimeSessionRoute(url.pathname);
        if (runtimeSessionId !== undefined && method === "GET") {
            await this.handleRuntimeGetSession(res, runtimeSessionId);
            return;
        }

        if (method === "GET" && url.pathname === "/api/project/deployment/targets") {
            this.handleListDeploymentTargets(res);
            return;
        }

        if (method === "POST" && url.pathname === "/api/project/deployment/runs") {
            await this.handleRunDeployment(req, res);
            return;
        }

        if (method === "POST" && url.pathname === "/api/project/outcome-libraries/select") {
            await this.handleSelectOutcomeLibrary(req, res);
            return;
        }

        if (method === "POST" && url.pathname === "/api/project/outcome-libraries/compare") {
            await this.handleCompareOutcomeLibraries(req, res);
            return;
        }

        if (method === "POST" && url.pathname === "/api/project/outcome-libraries/validate-deep") {
            await this.handleValidateOutcomeLibraryDeep(req, res);
            return;
        }

        if (method === "POST" && url.pathname === "/api/project/certification/validate-source") {
            await this.handleValidateCertificationSourceBundle(req, res);
            return;
        }

        if (method === "POST" && url.pathname === "/api/project/certification/build") {
            await this.handleBuildCertificationEvidenceBundle(req, res);
            return;
        }

        if (method === "POST" && url.pathname === "/api/project/fairness/configure") {
            await this.handleConfigureFairnessRound(req, res);
            return;
        }

        if (method === "POST" && url.pathname === "/api/project/fairness/generate") {
            await this.handleGenerateFairnessProof(req, res);
            return;
        }

        if (method === "POST" && url.pathname === "/api/project/fairness/verify") {
            await this.handleVerifyFairnessProof(req, res);
            return;
        }

        if (method === "POST" && url.pathname === "/api/project/blueprint/apply") {
            await this.handleApplyProjectBlueprint(req, res);
            return;
        }

        const toolId = this.matchToolRoute(url.pathname);
        if (toolId !== undefined) {
            const handled = await this.tryToolHandlers(toolId, method, url, req);
            if (handled !== undefined) {
                this.sendJson(res, handled.status, handled.body);
                return;
            }
        }

        if (method !== "GET") {
            this.sendJson(res, 404, {error: `Not found: ${method} ${url.pathname}`});
            return;
        }

        const filePath = this.resolveStaticFilePath(url.pathname);
        if (filePath === undefined) {
            this.sendJson(res, 404, {error: `Not found: ${url.pathname}`});
            return;
        }
        this.sendFile(res, filePath);
    }

    private matchToolRoute(pathname: string): string | undefined {
        const segments = pathname.split("/").filter((segment) => segment.length > 0);
        if (segments.length >= 3 && segments[0] === "api" && segments[1] === "tools") {
            return decodeURIComponent(segments[2]);
        }
        return undefined;
    }

    private matchSimulationRoute(pathname: string): string | undefined {
        const segments = pathname.split("/").filter((segment) => segment.length > 0);
        if (segments.length === 4 && segments[0] === "api" && segments[1] === "project" && segments[2] === "simulations") {
            return decodeURIComponent(segments[3]);
        }
        return undefined;
    }

    private matchReportRoute(pathname: string): {id: string; download: boolean} | undefined {
        const segments = pathname.split("/").filter((segment) => segment.length > 0);
        if (segments.length === 4 && segments[0] === "api" && segments[1] === "project" && segments[2] === "reports") {
            return {id: decodeURIComponent(segments[3]), download: false};
        }
        if (
            segments.length === 5 &&
            segments[0] === "api" &&
            segments[1] === "project" &&
            segments[2] === "reports" &&
            segments[4] === "download"
        ) {
            return {id: decodeURIComponent(segments[3]), download: true};
        }
        return undefined;
    }

    private matchReplayRoute(pathname: string): {id: string; download: boolean} | undefined {
        const segments = pathname.split("/").filter((segment) => segment.length > 0);
        if (segments.length === 4 && segments[0] === "api" && segments[1] === "project" && segments[2] === "replays") {
            return {id: decodeURIComponent(segments[3]), download: false};
        }
        if (
            segments.length === 5 &&
            segments[0] === "api" &&
            segments[1] === "project" &&
            segments[2] === "replays" &&
            segments[4] === "download"
        ) {
            return {id: decodeURIComponent(segments[3]), download: true};
        }
        return undefined;
    }

    private matchRuntimeSessionRoute(pathname: string): string | undefined {
        const segments = pathname.split("/").filter((segment) => segment.length > 0);
        if (
            segments.length === 5 &&
            segments[0] === "api" &&
            segments[1] === "project" &&
            segments[2] === "runtime" &&
            segments[3] === "sessions"
        ) {
            return decodeURIComponent(segments[4]);
        }
        return undefined;
    }

    private matchRuntimeSpinRoute(pathname: string): string | undefined {
        const segments = pathname.split("/").filter((segment) => segment.length > 0);
        if (
            segments.length === 6 &&
            segments[0] === "api" &&
            segments[1] === "project" &&
            segments[2] === "runtime" &&
            segments[3] === "sessions" &&
            segments[5] === "spins"
        ) {
            return decodeURIComponent(segments[4]);
        }
        return undefined;
    }

    private async tryToolHandlers(
        toolId: string,
        method: string,
        url: URL,
        req: IncomingMessage,
    ): Promise<{status: number; body: unknown} | undefined> {
        const handler = this.toolHandlers.find((candidate) => candidate.getToolId() === toolId);
        if (handler === undefined) {
            return undefined;
        }
        const body = await this.readJsonBody(req);
        return handler.handle(this.currentContext, {method, url, body});
    }

    // Every Home handler below follows the same shape: validate the body into a trusted request — a
    // genuinely malformed request (missing/invalid field) is the *only* case that produces an HTTP 4xx
    // with a plain `{error}` body, before StudioHomeService is ever called — then delegate the actual
    // operation to StudioHomeService (which never throws — see its own doc comment) and send its
    // plain-data result back as-is with a 2xx status, letting the DTO's own `status` field (ok/error/
    // invalid/load-error) carry the domain-level outcome. This mirrors GET /api/project/validate
    // returning 200 with a report that may itself say invalid:false — a well-formed request that
    // legitimately failed at the domain level is not a failed HTTP request. None of these ever spawn
    // `pokie create`/`init`/`build` as a subprocess or duplicate their logic — StudioHomeService drives
    // the exact same underlying services directly.
    private async handleHomeCreateProject(req: IncomingMessage, res: ServerResponse): Promise<void> {
        const body = await this.readJsonBody(req);
        let validated;
        try {
            validated = validateCreateProjectRequest((body ?? {}) as CreateProjectRequestInput);
        } catch (error) {
            this.sendJson(res, 400, {error: error instanceof Error ? error.message : String(error)});
            return;
        }

        const result = await this.homeService.createProject(validated);
        this.sendJson(res, result.status === "ok" ? 201 : 200, result);
    }

    private async handleHomeInitProject(req: IncomingMessage, res: ServerResponse): Promise<void> {
        const body = await this.readJsonBody(req);
        let validated;
        try {
            validated = validateInitProjectRequest((body ?? {}) as InitProjectRequestInput);
        } catch (error) {
            this.sendJson(res, 400, {error: error instanceof Error ? error.message : String(error)});
            return;
        }

        const result = await this.homeService.initProject(validated);
        this.sendJson(res, 200, result);
    }

    // Never writes anything (see StudioHomeService.previewBuild()) — always 200, even for a
    // "load-error"/"invalid" result, same reasoning as GET /api/project/validate returning 200 with a
    // report that may itself say invalid:false: this is a read of the blueprint's current state, not
    // a failed request.
    private async handleHomeBuildPreview(req: IncomingMessage, res: ServerResponse): Promise<void> {
        const body = await this.readJsonBody(req);
        let validated;
        try {
            validated = validateBuildRequest((body ?? {}) as BuildRequestInput);
        } catch (error) {
            this.sendJson(res, 400, {error: error instanceof Error ? error.message : String(error)});
            return;
        }

        this.sendJson(res, 200, this.homeService.previewBuild(validated));
    }

    private async handleHomeBuildProject(req: IncomingMessage, res: ServerResponse): Promise<void> {
        const body = await this.readJsonBody(req);
        let validated;
        try {
            validated = validateBuildRequest((body ?? {}) as BuildRequestInput);
        } catch (error) {
            this.sendJson(res, 400, {error: error instanceof Error ? error.message : String(error)});
            return;
        }

        const result = await this.homeService.buildProject(validated);
        this.sendJson(res, result.status === "ok" ? 201 : 200, result);
    }

    private async handleHomeOpenProject(req: IncomingMessage, res: ServerResponse): Promise<void> {
        const body = await this.readJsonBody(req);
        let validated;
        try {
            validated = validateOpenProjectRequest((body ?? {}) as OpenProjectRequestInput);
        } catch (error) {
            this.sendJson(res, 400, {error: error instanceof Error ? error.message : String(error)});
            return;
        }

        // loadProjectDashboardContext (behind StudioHomeService.openProject()) only ever resolves
        // "loaded" or "error" — "empty"/"loading" are exclusively synthesized elsewhere in this class
        // — but the check is spelled as `!== "loaded"` rather than `=== "error"` so TypeScript can
        // narrow `dashboard` to the "loaded" variant below without a cast.
        const dashboard = await this.homeService.openProject(validated.projectRoot);
        if (dashboard.status !== "loaded") {
            const message = dashboard.status === "error" ? dashboard.error : `Could not load "${validated.projectRoot}".`;
            this.sendJson(res, 400, {error: message});
            return;
        }

        // Stopped only now that the new project's dashboard has actually loaded — a *failed* open
        // never strands the previous project's runtime prematurely. Same reasoning as the
        // /api/projects/close branch's own call.
        await this.runtimeManager.stopForProjectSwitch();
        this.cancelActiveJobsForOldProject();

        // The explicit Home → Project Studio context transition: mutates this same running server's
        // state in place — no new HTTP server or Studio process is ever started (see the class-level
        // doc comment).
        this.currentContext = {mode: "project", projectRoot: dashboard.projectRoot};
        this.projectDashboard = dashboard;
        this.sendJson(res, 200, {context: this.currentContext, manifest: dashboard.game});
    }

    // The five Blueprint Editor handlers below follow the same validate-then-delegate shape as the Home
    // handlers above — see that block's own doc comment. StudioBlueprintService never throws either;
    // its DTOs' own `status` field carries every domain-level outcome (including a save conflict, which
    // does get a real 409 — see handleBlueprintSave below — since "a file already exists and needs
    // explicit confirmation" is a conflict with current state, the same class of case as an
    // already-running simulation/replay, not a validation failure).
    private async handleBlueprintValidate(req: IncomingMessage, res: ServerResponse): Promise<void> {
        const body = await this.readJsonBody(req);
        let validated;
        try {
            validated = validateBlueprintValidationRequest((body ?? {}) as BlueprintValidationRequestInput);
        } catch (error) {
            this.sendJson(res, 400, {error: error instanceof Error ? error.message : String(error)});
            return;
        }

        this.sendJson(res, 200, this.blueprintService.validate(validated.blueprint));
    }

    private async handleBlueprintLoad(req: IncomingMessage, res: ServerResponse): Promise<void> {
        const body = await this.readJsonBody(req);
        let validated;
        try {
            validated = validateLoadBlueprintRequest((body ?? {}) as LoadBlueprintRequestInput);
        } catch (error) {
            this.sendJson(res, 400, {error: error instanceof Error ? error.message : String(error)});
            return;
        }

        this.sendJson(res, 200, this.blueprintService.load(validated.path));
    }

    private async handleBlueprintSave(req: IncomingMessage, res: ServerResponse): Promise<void> {
        const body = await this.readJsonBody(req);
        let validated;
        try {
            validated = validateSaveBlueprintRequest((body ?? {}) as SaveBlueprintRequestInput);
        } catch (error) {
            this.sendJson(res, 400, {error: error instanceof Error ? error.message : String(error)});
            return;
        }

        const result = this.blueprintService.save(validated.path, validated.blueprint, validated.overwrite);
        this.sendJson(res, this.statusForBlueprintSave(result.status), result);
    }

    private statusForBlueprintSave(status: "ok" | "conflict" | "error"): number {
        if (status === "ok") {
            return 201;
        }
        return status === "conflict" ? 409 : 200;
    }

    private async handleBlueprintBuildPreview(req: IncomingMessage, res: ServerResponse): Promise<void> {
        const body = await this.readJsonBody(req);
        let validated;
        try {
            validated = validateBlueprintBuildRequest((body ?? {}) as BlueprintBuildRequestInput);
        } catch (error) {
            this.sendJson(res, 400, {error: error instanceof Error ? error.message : String(error)});
            return;
        }

        this.sendJson(res, 200, this.blueprintService.previewBuild(validated.blueprint, validated.outDir, validated.sourcePath));
    }

    // Same request shape as /validate (just "blueprint") -- reuses validateBlueprintValidationRequest
    // rather than a near-duplicate validator.
    private async handleBlueprintReelStripGenerationPreview(req: IncomingMessage, res: ServerResponse): Promise<void> {
        const body = await this.readJsonBody(req);
        let validated;
        try {
            validated = validateBlueprintValidationRequest((body ?? {}) as BlueprintValidationRequestInput);
        } catch (error) {
            this.sendJson(res, 400, {error: error instanceof Error ? error.message : String(error)});
            return;
        }

        this.sendJson(res, 200, this.blueprintService.previewReelStripGeneration(validated.blueprint));
    }

    private async handleBlueprintParImport(req: IncomingMessage, res: ServerResponse): Promise<void> {
        const body = await this.readJsonBody(req);
        let validated;
        try {
            validated = validateParSheetImportRequest((body ?? {}) as ParSheetImportRequestInput);
        } catch (error) {
            this.sendJson(res, 400, {error: error instanceof Error ? error.message : String(error)});
            return;
        }

        this.sendJson(res, 200, await this.blueprintService.importParSheet(validated.path));
    }

    private async handleBlueprintParExport(req: IncomingMessage, res: ServerResponse): Promise<void> {
        const body = await this.readJsonBody(req);
        let validated;
        try {
            validated = validateParSheetExportRequest((body ?? {}) as ParSheetExportRequestInput);
        } catch (error) {
            this.sendJson(res, 400, {error: error instanceof Error ? error.message : String(error)});
            return;
        }

        const result = await this.blueprintService.exportParSheet(validated.blueprint, validated.path, validated.overwrite, validated.sourcePath);
        this.sendJson(res, this.statusForParSheetExport(result.status), result);
    }

    private statusForParSheetExport(status: "ok" | "conflict" | "invalid" | "error"): number {
        if (status === "ok") {
            return 201;
        }
        return status === "conflict" ? 409 : 200;
    }

    private async handleBlueprintBuild(req: IncomingMessage, res: ServerResponse): Promise<void> {
        const body = await this.readJsonBody(req);
        let validated;
        try {
            validated = validateBlueprintBuildRequest((body ?? {}) as BlueprintBuildRequestInput);
        } catch (error) {
            this.sendJson(res, 400, {error: error instanceof Error ? error.message : String(error)});
            return;
        }

        const result = await this.blueprintService.build(validated.blueprint, validated.outDir, validated.sourcePath);
        this.sendJson(res, result.status === "ok" ? 201 : 200, result);
    }

    private handleInspectProject(res: ServerResponse): void {
        if (this.currentContext.mode !== "project") {
            this.sendJson(res, 409, {error: "No active project."});
            return;
        }
        this.sendJson(res, 200, this.gamePackageInspector.inspect(this.currentContext.projectRoot));
    }

    private async handleValidateProject(res: ServerResponse): Promise<void> {
        if (this.currentContext.mode !== "project") {
            this.sendJson(res, 409, {error: "No active project."});
            return;
        }
        this.sendJson(res, 200, await this.gamePackageValidator.validate(this.currentContext.projectRoot));
    }

    private handleListDeploymentTargets(res: ServerResponse): void {
        if (this.currentContext.mode !== "project") {
            this.sendJson(res, 409, {error: "No active project."});
            return;
        }
        this.sendJson(res, 200, this.deploymentService.listTargets(this.currentContext.projectRoot));
    }

    // A well-formed request that fails at the domain level (unknown targetId, an unreadable/malformed
    // library file) still gets its own precise status (404 / 400) here, same as everywhere else in this
    // class — only the pipeline's own findings (incompatible content, a failed projector, ...) are
    // ever carried in the 200 response's own DTO, via StudioDeploymentService.run()'s "ok" branch.
    private async handleRunDeployment(req: IncomingMessage, res: ServerResponse): Promise<void> {
        if (this.currentContext.mode !== "project") {
            this.sendJson(res, 409, {error: "No active project."});
            return;
        }

        const body = await this.readJsonBody(req);
        let validated;
        try {
            validated = validateDeploymentRunRequest((body ?? {}) as DeploymentRunRequestInput);
        } catch (error) {
            this.sendJson(res, 400, {error: error instanceof Error ? error.message : String(error)});
            return;
        }

        const result = await this.deploymentService.run(this.currentContext.projectRoot, validated);
        if (result.status === "target-not-found") {
            this.sendJson(res, 404, {error: `Unknown deployment target "${validated.targetId}".`});
            return;
        }
        if (result.status === "load-error") {
            this.sendJson(res, 400, {error: result.error});
            return;
        }
        this.sendJson(res, 200, result.view);
    }

    private async handleSelectOutcomeLibrary(req: IncomingMessage, res: ServerResponse): Promise<void> {
        if (this.currentContext.mode !== "project") {
            this.sendJson(res, 409, {error: "No active project."});
            return;
        }

        const body = await this.readJsonBody(req);
        let validated;
        try {
            validated = validateOutcomeLibrarySelectRequest((body ?? {}) as OutcomeLibrarySelectRequestInput);
        } catch (error) {
            this.sendJson(res, 400, {error: error instanceof Error ? error.message : String(error)});
            return;
        }

        this.sendJson(res, 200, await this.outcomeLibraryService.select(this.currentContext.projectRoot, validated.selector));
    }

    private async handleCompareOutcomeLibraries(req: IncomingMessage, res: ServerResponse): Promise<void> {
        if (this.currentContext.mode !== "project") {
            this.sendJson(res, 409, {error: "No active project."});
            return;
        }

        const body = await this.readJsonBody(req);
        let validated;
        try {
            validated = validateOutcomeLibraryCompareRequest((body ?? {}) as OutcomeLibraryCompareRequestInput);
        } catch (error) {
            this.sendJson(res, 400, {error: error instanceof Error ? error.message : String(error)});
            return;
        }

        this.sendJson(
            res,
            200,
            await this.outcomeLibraryService.compare(this.currentContext.projectRoot, validated.left, validated.right, validated.expectedLeftHash),
        );
    }

    private async handleValidateOutcomeLibraryDeep(req: IncomingMessage, res: ServerResponse): Promise<void> {
        if (this.currentContext.mode !== "project") {
            this.sendJson(res, 409, {error: "No active project."});
            return;
        }

        const body = await this.readJsonBody(req);
        let validated;
        try {
            validated = validateOutcomeLibraryDeepValidateRequest((body ?? {}) as OutcomeLibraryDeepValidateRequestInput);
        } catch (error) {
            this.sendJson(res, 400, {error: error instanceof Error ? error.message : String(error)});
            return;
        }

        this.sendJson(res, 200, await this.outcomeLibraryService.validateBundleDeep(this.currentContext.projectRoot, validated.bundleDir, validated.modeName));
    }

    private async handleValidateCertificationSourceBundle(req: IncomingMessage, res: ServerResponse): Promise<void> {
        if (this.currentContext.mode !== "project") {
            this.sendJson(res, 409, {error: "No active project."});
            return;
        }

        const body = await this.readJsonBody(req);
        let validated;
        try {
            validated = validateCertificationSourceValidateRequest((body ?? {}) as CertificationSourceValidateRequestInput);
        } catch (error) {
            this.sendJson(res, 400, {error: error instanceof Error ? error.message : String(error)});
            return;
        }

        this.sendJson(res, 200, await this.certificationService.validateSourceBundle(this.currentContext.projectRoot, validated.bundleDir));
    }

    private async handleBuildCertificationEvidenceBundle(req: IncomingMessage, res: ServerResponse): Promise<void> {
        if (this.currentContext.mode !== "project") {
            this.sendJson(res, 409, {error: "No active project."});
            return;
        }

        const body = await this.readJsonBody(req);
        let validated;
        try {
            validated = validateCertificationBuildRequest((body ?? {}) as CertificationBuildRequestInput);
        } catch (error) {
            this.sendJson(res, 400, {error: error instanceof Error ? error.message : String(error)});
            return;
        }

        this.sendJson(
            res,
            200,
            await this.certificationService.build(this.currentContext.projectRoot, validated.bundleDir, validated.modes, validated.outDir),
        );
    }

    private async handleConfigureFairnessRound(req: IncomingMessage, res: ServerResponse): Promise<void> {
        if (this.currentContext.mode !== "project") {
            this.sendJson(res, 409, {error: "No active project."});
            return;
        }

        const body = await this.readJsonBody(req);
        let validated;
        try {
            validated = validateFairnessConfigureRequest((body ?? {}) as FairnessConfigureRequestInput);
        } catch (error) {
            this.sendJson(res, 400, {error: error instanceof Error ? error.message : String(error)});
            return;
        }

        this.sendJson(res, 200, await this.fairnessService.configure(this.currentContext.projectRoot, validated));
    }

    private async handleGenerateFairnessProof(req: IncomingMessage, res: ServerResponse): Promise<void> {
        if (this.currentContext.mode !== "project") {
            this.sendJson(res, 409, {error: "No active project."});
            return;
        }

        const body = await this.readJsonBody(req);
        let validated;
        try {
            validated = validateFairnessGenerateRequest((body ?? {}) as FairnessGenerateRequestInput);
        } catch (error) {
            this.sendJson(res, 400, {error: error instanceof Error ? error.message : String(error)});
            return;
        }

        this.sendJson(res, 200, await this.fairnessService.generateProof(this.currentContext.projectRoot, validated));
    }

    private async handleVerifyFairnessProof(req: IncomingMessage, res: ServerResponse): Promise<void> {
        if (this.currentContext.mode !== "project") {
            this.sendJson(res, 409, {error: "No active project."});
            return;
        }

        const body = await this.readJsonBody(req);
        let validated;
        try {
            validated = validateFairnessVerifyRequest((body ?? {}) as FairnessVerifyRequestInput);
        } catch (error) {
            this.sendJson(res, 400, {error: error instanceof Error ? error.message : String(error)});
            return;
        }

        this.sendJson(res, 200, await this.fairnessService.verify(this.currentContext.projectRoot, validated));
    }

    // projectRoot/sourcePath are always resolved here, from the current project's own build-info.json
    // (the same GamePackageInspector.inspect() /api/project/inspect itself uses) — never taken from the
    // request body — so a client can never point this at a path outside the project it actually opened.
    private async handleApplyProjectBlueprint(req: IncomingMessage, res: ServerResponse): Promise<void> {
        if (this.currentContext.mode !== "project") {
            this.sendJson(res, 409, {error: "No active project."});
            return;
        }

        const report = this.gamePackageInspector.inspect(this.currentContext.projectRoot);
        if (!report.generated || report.buildInfo?.source === undefined) {
            this.sendJson(res, 200, {status: "error", error: "This project wasn't built from a tracked source blueprint, so it has nothing to apply to."});
            return;
        }

        const body = await this.readJsonBody(req);
        let validated;
        try {
            validated = validateApplyProjectBlueprintRequest((body ?? {}) as ApplyProjectBlueprintRequestInput);
        } catch (error) {
            this.sendJson(res, 400, {error: error instanceof Error ? error.message : String(error)});
            return;
        }

        const result = this.blueprintService.applyToProject(this.currentContext.projectRoot, report.buildInfo.source, validated.expectedHash, validated.blueprint);
        this.sendJson(res, this.statusForApplyProjectBlueprint(result.status), result);
    }

    private statusForApplyProjectBlueprint(status: "ok" | "conflict" | "invalid" | "error"): number {
        return status === "conflict" ? 409 : 200;
    }

    private async handleStartSimulation(req: IncomingMessage, res: ServerResponse): Promise<void> {
        if (this.currentContext.mode !== "project") {
            this.sendJson(res, 409, {error: "No active project."});
            return;
        }

        const body = await this.readJsonBody(req);
        let validated;
        try {
            validated = validateSimulationRequest((body ?? {}) as SimulationRequestInput);
        } catch (error) {
            this.sendJson(res, 400, {error: error instanceof Error ? error.message : String(error)});
            return;
        }

        const result = this.simulationService.start(this.currentContext.projectRoot, validated);
        if (result.status === "conflict") {
            this.sendJson(res, 409, {
                error: "A simulation is already running for this project.",
                activeJobId: result.activeJobId,
            });
            return;
        }
        this.sendJson(res, 202, result.job);
    }

    private handleGetSimulation(res: ServerResponse, id: string): void {
        const job = this.simulationService.getStatus(id);
        if (!job) {
            this.sendJson(res, 404, {error: `Unknown simulation id "${id}".`});
            return;
        }
        this.sendJson(res, 200, job);
    }

    private handleCancelSimulation(res: ServerResponse, id: string): void {
        const job = this.simulationService.cancel(id);
        if (!job) {
            this.sendJson(res, 404, {error: `Unknown simulation id "${id}".`});
            return;
        }
        this.sendJson(res, 200, job);
    }

    private handleListReports(res: ServerResponse): void {
        if (this.currentContext.mode !== "project") {
            this.sendJson(res, 409, {error: "No active project."});
            return;
        }
        this.sendJson(res, 200, this.simulationService.listReports(this.currentContext.projectRoot));
    }

    private handleGetReport(res: ServerResponse, id: string): void {
        if (this.currentContext.mode !== "project") {
            this.sendJson(res, 409, {error: "No active project."});
            return;
        }
        const result = this.simulationService.getReport(this.currentContext.projectRoot, id);
        if (result.status === "not-found") {
            this.sendJson(res, 404, {error: `Unknown report id "${id}".`});
            return;
        }
        if (result.status === "not-ready") {
            this.sendJson(res, 409, {error: this.describeReportNotReady(id, result.jobStatus)});
            return;
        }
        const detail: StudioSimulationReportDetail = {report: result.report, statistics: result.statistics};
        this.sendJson(res, 200, detail);
    }

    private handleDownloadReport(res: ServerResponse, id: string, url: URL): void {
        if (this.currentContext.mode !== "project") {
            this.sendJson(res, 409, {error: "No active project."});
            return;
        }
        const format = url.searchParams.get("format");
        if (!isReportDownloadFormat(format)) {
            this.sendJson(res, 400, {error: '"format" must be one of "json", "markdown", "html".'});
            return;
        }
        const result = this.simulationService.getReport(this.currentContext.projectRoot, id);
        if (result.status === "not-found") {
            this.sendJson(res, 404, {error: `Unknown report id "${id}".`});
            return;
        }
        if (result.status === "not-ready") {
            this.sendJson(res, 409, {error: this.describeReportNotReady(id, result.jobStatus)});
            return;
        }

        const download = buildSimulationReportDownload(result.report, id, format);
        res.writeHead(200, {
            "Content-Type": download.contentType,
            "Content-Disposition": `attachment; filename="${download.filename}"`,
        });
        res.end(download.body);
    }

    private describeReportNotReady(id: string, jobStatus: StudioSimulationStatus): string {
        if (jobStatus === "queued" || jobStatus === "running") {
            return `Simulation "${id}" has not completed yet (status: ${jobStatus}).`;
        }
        return `Simulation "${id}" has no report (status: ${jobStatus}).`;
    }

    private async handleStartReplay(req: IncomingMessage, res: ServerResponse): Promise<void> {
        if (this.currentContext.mode !== "project") {
            this.sendJson(res, 409, {error: "No active project."});
            return;
        }

        const body = await this.readJsonBody(req);
        let validated;
        try {
            validated = validateReplayRequest((body ?? {}) as ReplayRequestInput);
        } catch (error) {
            this.sendJson(res, 400, {error: error instanceof Error ? error.message : String(error)});
            return;
        }

        const result = this.replayService.start(this.currentContext.projectRoot, validated);
        if (result.status === "conflict") {
            this.sendJson(res, 409, {
                error: "A replay is already running for this project.",
                activeJobId: result.activeJobId,
            });
            return;
        }
        this.sendJson(res, 202, result.job);
    }

    // Validates a user-pasted ReplayDescriptor-shaped JSON (Replay & Debug's "Replay Artifact" find
    // method) before the client attempts an actual reproduction via the existing POST
    // /api/project/replays -- reuses validateReplayRequest as-is for the outer round/seed (the same
    // check a real replay start already applies, so the two can never silently disagree on what counts
    // as valid) and RoundArtifactValidator as-is for the optional nested `.artifact`, rather than any
    // new validation logic. The nested artifact's own issues are reported as non-fatal
    // `artifactWarnings` (not a 400) since round/seed alone are already enough to attempt a
    // reproduction -- a slightly malformed artifact *detail* shouldn't block that.
    private async handleInspectReplayArtifact(req: IncomingMessage, res: ServerResponse): Promise<void> {
        if (this.currentContext.mode !== "project") {
            this.sendJson(res, 409, {error: "No active project."});
            return;
        }

        const body = await this.readJsonBody(req);
        if (typeof body !== "object" || body === null) {
            this.sendJson(res, 400, {error: "Request body must be a JSON object."});
            return;
        }

        const record = body as Record<string, unknown>;
        let validated;
        try {
            validated = validateReplayRequest({round: record.round, seed: record.seed} as ReplayRequestInput);
        } catch (error) {
            this.sendJson(res, 400, {error: error instanceof Error ? error.message : String(error)});
            return;
        }

        const artifactWarnings =
            record.artifact !== undefined
                ? new RoundArtifactValidator().validate(record.artifact as unknown as Parameters<RoundArtifactValidator["validate"]>[0]).map((issue) => issue.message)
                : [];

        this.sendJson(res, 200, {round: validated.round, seed: validated.seed, artifactWarnings});
    }

    private handleListReplays(res: ServerResponse): void {
        if (this.currentContext.mode !== "project") {
            this.sendJson(res, 409, {error: "No active project."});
            return;
        }
        this.sendJson(res, 200, this.replayService.listJobs(this.currentContext.projectRoot));
    }

    private handleGetReplay(res: ServerResponse, id: string): void {
        if (this.currentContext.mode !== "project") {
            this.sendJson(res, 409, {error: "No active project."});
            return;
        }
        const job = this.replayService.getStatus(this.currentContext.projectRoot, id);
        if (!job) {
            this.sendJson(res, 404, {error: `Unknown replay id "${id}".`});
            return;
        }
        this.sendJson(res, 200, job);
    }

    private handleCancelReplay(res: ServerResponse, id: string): void {
        if (this.currentContext.mode !== "project") {
            this.sendJson(res, 409, {error: "No active project."});
            return;
        }
        const job = this.replayService.cancel(this.currentContext.projectRoot, id);
        if (!job) {
            this.sendJson(res, 404, {error: `Unknown replay id "${id}".`});
            return;
        }
        this.sendJson(res, 200, job);
    }

    private handleDownloadReplay(res: ServerResponse, id: string): void {
        if (this.currentContext.mode !== "project") {
            this.sendJson(res, 409, {error: "No active project."});
            return;
        }
        const result = this.replayService.getDownload(this.currentContext.projectRoot, id);
        if (result.status === "not-found") {
            this.sendJson(res, 404, {error: `Unknown replay id "${id}".`});
            return;
        }
        if (result.status === "not-ready") {
            this.sendJson(res, 409, {error: this.describeReplayNotReady(id, result.jobStatus)});
            return;
        }

        const download = buildReplayDownload(result.descriptor, id);
        res.writeHead(200, {
            "Content-Type": download.contentType,
            "Content-Disposition": `attachment; filename="${download.filename}"`,
        });
        res.end(download.body);
    }

    private describeReplayNotReady(id: string, jobStatus: StudioReplayStatus): string {
        if (jobStatus === "queued" || jobStatus === "running") {
            return `Replay "${id}" has not completed yet (status: ${jobStatus}).`;
        }
        return `Replay "${id}" has no descriptor (status: ${jobStatus}).`;
    }

    // The seven Runtime tab handlers below all share the same "No active project." 409 guard as every
    // other /api/project/* route. StudioRuntimeManager never throws — its own result types carry every
    // domain-level outcome (not-running/not-found/blocked/conflict/error), translated to a status code
    // here the same way every other Studio route does; StudioRuntimeManager.buildSessionView() is the
    // one place that ever reads PokieDevServer's raw JSON, so nothing here ever sees a repository
    // instance, a WalletPort, or a raw session object — only the same plain JSON any HTTP client of the
    // running server would get back.
    private handleGetRuntime(res: ServerResponse): void {
        if (this.currentContext.mode !== "project") {
            this.sendJson(res, 409, {error: "No active project."});
            return;
        }
        this.sendJson(res, 200, this.runtimeManager.getState());
    }

    // Replay & Debug's "Session Spin" find method -- an empty list (never started the runtime, or
    // started without debug mode, or the runtime was since stopped/restarted/the project switched) is
    // still a valid 200, same as StudioSimulationService.listReports()/StudioReplayExecutionService.
    // listJobs() returning [] rather than erroring for "nothing yet".
    private handleListRecentSpins(res: ServerResponse): void {
        if (this.currentContext.mode !== "project") {
            this.sendJson(res, 409, {error: "No active project."});
            return;
        }
        this.sendJson(res, 200, this.runtimeManager.listRecentSpins());
    }

    private async handleRuntimeStart(req: IncomingMessage, res: ServerResponse): Promise<void> {
        if (this.currentContext.mode !== "project") {
            this.sendJson(res, 409, {error: "No active project."});
            return;
        }

        const body = await this.readJsonBody(req);
        let validated;
        try {
            validated = validateStartRuntimeRequest((body ?? {}) as StartRuntimeRequestInput);
        } catch (error) {
            this.sendJson(res, 400, {error: error instanceof Error ? error.message : String(error)});
            return;
        }

        const result = await this.runtimeManager.start(this.currentContext.projectRoot, validated);
        this.sendRuntimeStartResult(res, result);
    }

    // Unlike start(), an omitted body genuinely means something different from an empty `{}` body: no
    // body at all reuses whatever the last successful start's options were (StudioRuntimeManager.
    // restart()'s own fallback); an explicit `{}` means "restart with defaults," same as a fresh start.
    private async handleRuntimeRestart(req: IncomingMessage, res: ServerResponse): Promise<void> {
        if (this.currentContext.mode !== "project") {
            this.sendJson(res, 409, {error: "No active project."});
            return;
        }

        const body = await this.readJsonBody(req);
        let validated: ValidatedStartRuntimeRequest | undefined;
        if (body !== undefined) {
            try {
                validated = validateStartRuntimeRequest(body as StartRuntimeRequestInput);
            } catch (error) {
                this.sendJson(res, 400, {error: error instanceof Error ? error.message : String(error)});
                return;
            }
        }

        const result = await this.runtimeManager.restart(this.currentContext.projectRoot, validated);
        this.sendRuntimeStartResult(res, result);
    }

    private sendRuntimeStartResult(res: ServerResponse, result: StudioRuntimeStartResult): void {
        if (result.status === "already-running") {
            this.sendJson(res, 409, {error: "Runtime is already running.", state: result.view});
            return;
        }
        if (result.status === "failed") {
            this.sendJson(res, 200, {status: "failed", error: result.error});
            return;
        }
        this.sendJson(res, 201, result.view);
    }

    private async handleRuntimeStop(res: ServerResponse): Promise<void> {
        if (this.currentContext.mode !== "project") {
            this.sendJson(res, 409, {error: "No active project."});
            return;
        }
        // Idempotent either way — StudioRuntimeManager.stop() never errors, see its own doc comment.
        await this.runtimeManager.stop();
        this.sendJson(res, 200, {status: "stopped"});
    }

    private async handleRuntimeCreateSession(req: IncomingMessage, res: ServerResponse): Promise<void> {
        if (this.currentContext.mode !== "project") {
            this.sendJson(res, 409, {error: "No active project."});
            return;
        }

        const body = await this.readJsonBody(req);
        let validated;
        try {
            validated = validateRuntimeSessionRequest((body ?? {}) as RuntimeSessionRequestInput);
        } catch (error) {
            this.sendJson(res, 400, {error: error instanceof Error ? error.message : String(error)});
            return;
        }

        const result = await this.runtimeManager.createSession(validated.seed, validated.initialBalance);
        if (result.status === "ok") {
            this.sendJson(res, 201, {status: "ok", session: result.session});
            return;
        }
        this.sendRuntimeErrorResult(res, "(new session)", result);
    }

    private async handleRuntimeGetSession(res: ServerResponse, sessionId: string): Promise<void> {
        if (this.currentContext.mode !== "project") {
            this.sendJson(res, 409, {error: "No active project."});
            return;
        }

        const result = await this.runtimeManager.getSession(sessionId);
        if (result.status === "ok") {
            this.sendJson(res, 200, {status: "ok", session: result.session});
            return;
        }
        this.sendRuntimeErrorResult(res, sessionId, result);
    }

    private async handleRuntimeSpin(req: IncomingMessage, res: ServerResponse, sessionId: string): Promise<void> {
        if (this.currentContext.mode !== "project") {
            this.sendJson(res, 409, {error: "No active project."});
            return;
        }

        const body = await this.readJsonBody(req);
        let validated;
        try {
            validated = validateRuntimeSpinRequest((body ?? {}) as RuntimeSpinRequestInput);
        } catch (error) {
            this.sendJson(res, 400, {error: error instanceof Error ? error.message : String(error)});
            return;
        }

        const result = await this.runtimeManager.spin(sessionId, validated.requestId, validated.expectedSessionVersion);
        if (result.status === "ok") {
            this.sendJson(res, 200, {status: "ok", session: result.session});
            return;
        }
        this.sendRuntimeErrorResult(res, sessionId, result);
    }

    // Shared by getSession/spin's non-"ok" outcomes (createSession only ever reaches "not-running"/
    // "error" here — PokieDevServer's POST /sessions never 404s). "not-found"/"blocked"/"conflict" are
    // bare `{"error"}` bodies mirroring exactly what PokieDevServer itself would return to any client
    // of the running server; "not-running" is a Studio-level precondition PokieDevServer has no
    // equivalent for; "error" covers anything else (safe message only, never a stack trace).
    // "not-running" and "conflict" are both a 409 (an optimistic-locking conflict is, deliberately,
    // an HTTP conflict — see the task's own requirement to surface it as one), so a `reason` field
    // disambiguates them for the frontend instead of asking it to pattern-match `error`'s free-text
    // message.
    private sendRuntimeErrorResult(
        res: ServerResponse,
        sessionId: string,
        result: Exclude<StudioRuntimeSessionResult | StudioRuntimeSpinResult, {status: "ok"}>,
    ): void {
        if (result.status === "not-found") {
            this.sendJson(res, 404, {error: `Unknown sessionId "${sessionId}".`});
            return;
        }
        if (result.status === "not-running") {
            this.sendJson(res, 409, {error: "Runtime is not running. Start it first.", reason: "not-running"});
            return;
        }
        if (result.status === "blocked") {
            this.sendJson(res, 400, {error: result.error});
            return;
        }
        if (result.status === "conflict") {
            this.sendJson(res, 409, {error: result.error, reason: "conflict"});
            return;
        }
        this.sendJson(res, 200, {status: "error", error: result.error});
    }

    private async readJsonBody(req: IncomingMessage): Promise<unknown> {
        const raw = await this.readBody(req);
        if (!raw) {
            return undefined;
        }
        try {
            return JSON.parse(raw);
        } catch {
            return undefined;
        }
    }

    private readBody(req: IncomingMessage): Promise<string> {
        return new Promise((resolve, reject) => {
            const chunks: Buffer[] = [];
            req.on("data", (chunk: Buffer) => chunks.push(chunk));
            req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
            req.on("error", reject);
        });
    }

    // Safe-by-construction, same containment approach as PokieClientServer.resolveStaticFilePath
    // (kept as its own copy here rather than a shared import — studioRoot and clientRoot are
    // different, independently-configured static asset roots with no other coupling).
    private resolveStaticFilePath(pathname: string): string | undefined {
        const decodedPath = decodeURIComponent(pathname === "/" ? "/index.html" : pathname);
        const resolved = path.resolve(this.studioRoot, `.${decodedPath}`);
        if (!isPathWithin(this.studioRoot, resolved)) {
            return undefined;
        }
        if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
            return undefined;
        }
        return resolved;
    }

    private sendFile(res: ServerResponse, filePath: string): void {
        const contentType = CONTENT_TYPES[path.extname(filePath)] ?? "application/octet-stream";
        res.writeHead(200, {"Content-Type": contentType});
        res.end(fs.readFileSync(filePath));
    }

    private sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
        res.writeHead(statusCode, {"Content-Type": "application/json"});
        res.end(JSON.stringify(body));
    }
}
