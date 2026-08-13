import {
    GamePackageInspecting,
    GamePackageInspectionReport,
    GamePackageInspector,
    loadPokieGame,
    OutcomeSourceProjectAnalyzer,
    OutcomeSourceProjectAnalyzing,
    PokieDevServerAddress,
    PokieGamePackageValidating,
    PokieGamePackageValidationReport,
    PokieGamePackageValidator,
    PokieJsonRoundArtifactProjector,
    PokieProject,
    ProjectTargetResolver,
    readWasmComponentManifest,
    RoundArtifact,
    RoundArtifactValidator,
    sampleOutcomeSourceProject,
    SecureWeightedOutcomeRandomSource,
    SeededWeightedOutcomeRandomSource,
    STUDIO_OPERATION,
} from "pokie";
import crypto from "crypto";
import fs from "fs";
import http, {IncomingMessage, ServerResponse} from "http";
import path from "path";
import {StudioArtifactBuildService} from "./artifacts/StudioArtifactBuildService.js";
import {validateArtifactBuildRequest, ArtifactBuildRequestInput} from "./artifacts/validateArtifactBuildRequest.js";
import {buildProjectGameModel} from "./blueprint/buildProjectGameModel.js";
import {StudioBlueprintService} from "./blueprint/StudioBlueprintService.js";
import {validateBlueprintBuildRequest, BlueprintBuildRequestInput} from "./blueprint/validateBlueprintBuildRequest.js";
import {validateBlueprintValidationRequest, BlueprintValidationRequestInput} from "./blueprint/validateBlueprintValidationRequest.js";
import {validateLoadBlueprintRequest, LoadBlueprintRequestInput} from "./blueprint/validateLoadBlueprintRequest.js";
import {validateCheckBlueprintSourceRequest, CheckBlueprintSourceRequestInput} from "./blueprint/validateCheckBlueprintSourceRequest.js";
import {validateBlueprintRandomRequest, BlueprintRandomRequestInput} from "./blueprint/validateBlueprintRandomRequest.js";
import {validateParSheetExportRequest, ParSheetExportRequestInput} from "./blueprint/validateParSheetExportRequest.js";
import {validateParSheetImportRequest, ParSheetImportRequestInput} from "./blueprint/validateParSheetImportRequest.js";
import {validateSaveBlueprintRequest, SaveBlueprintRequestInput} from "./blueprint/validateSaveBlueprintRequest.js";
import {
    validateSaveManagedBlueprintRequest,
    SaveManagedBlueprintRequestInput,
} from "./blueprint/validateSaveManagedBlueprintRequest.js";
import {StudioCertificationService} from "./certification/StudioCertificationService.js";
import {validateCertificationBuildRequest, CertificationBuildRequestInput} from "./certification/validateCertificationBuildRequest.js";
import {
    validateCertificationSourceValidateRequest,
    CertificationSourceValidateRequestInput,
} from "./certification/validateCertificationSourceValidateRequest.js";
import {StudioDeploymentService} from "./deployment/StudioDeploymentService.js";
import {validateDeploymentRunRequest, DeploymentRunRequestInput} from "./deployment/validateDeploymentRunRequest.js";
import {createMaterializingRuntimePackageResolver, RuntimePackageResolving} from "../materialize/materializeRuntimePackage.js";
import {StudioFairnessService} from "./fairness/StudioFairnessService.js";
import {validateFairnessConfigureRequest, FairnessConfigureRequestInput} from "./fairness/validateFairnessConfigureRequest.js";
import {validateFairnessGenerateRequest, FairnessGenerateRequestInput} from "./fairness/validateFairnessGenerateRequest.js";
import {validateFairnessVerifyRequest, FairnessVerifyRequestInput} from "./fairness/validateFairnessVerifyRequest.js";
import {StudioFsBrowseService} from "./home/StudioFsBrowseService.js";
import {StudioHomeService} from "./home/StudioHomeService.js";
import {StudioNativePickerService} from "./home/StudioNativePickerService.js";
import {validateNativeBrowseRequest, NativeBrowseRequestInput} from "./home/validateNativeBrowseRequest.js";
import {StudioOutcomeLibraryGenerateService} from "./outcomeLibrary/StudioOutcomeLibraryGenerateService.js";
import {
    validateOutcomeLibraryGenerateEstimateRequest,
    OutcomeLibraryGenerateEstimateRequestInput,
} from "./outcomeLibrary/validateOutcomeLibraryGenerateEstimateRequest.js";
import {validateOutcomeLibraryGenerateRequest, OutcomeLibraryGenerateRequestInput} from "./outcomeLibrary/validateOutcomeLibraryGenerateRequest.js";
import {
    validateOutcomeSourceSampleRequest,
    OutcomeSourceSampleRequestInput,
} from "./outcomeSource/validateOutcomeSourceSampleRequest.js";
import type {StudioDiagnosticsView} from "./StudioDiagnosticsView.js";
import {validateOpenProjectRequest, OpenProjectRequestInput} from "./home/validateOpenProjectRequest.js";
import {loadProjectDashboardContext, type ProjectLocationDescribing} from "./loadProjectDashboardContext.js";
import type {ProjectDashboardContext} from "./ProjectDashboardContext.js";
import {isLoopbackRequest} from "./isLoopbackRequest.js";
import {isPathWithin} from "./isPathWithin.js";
import {openInFileManager} from "../openInFileManager.js";
import {validateOpenFolderRequest, OpenFolderRequestInput} from "./home/validateOpenFolderRequest.js";
import {buildReplayDownload} from "./replay/buildReplayDownload.js";
import type {StudioReplayJobRecord} from "./replay/StudioReplayJobRecord.js";
import {StudioReplayExecutionService} from "./replay/StudioReplayExecutionService.js";
import type {StudioReplayStatus} from "./replay/StudioReplayStatus.js";
import {validateReplayRequest, ReplayRequestInput} from "./replay/validateReplayRequest.js";
import {StudioPlayService, StudioPlaySpinResult} from "./runtime/StudioPlayService.js";
import {StudioRoundRecorder} from "./runtime/StudioRoundRecorder.js";
import type {StudioRuntimeSessionView} from "./runtime/StudioRuntimeSessionView.js";
import {createDefaultStudioProjectRegistrationService, StudioProjectRegistrationService} from "./StudioProjectRegistrationService.js";
import {validateProjectLocationRequest, ProjectLocationRequestInput} from "./validateProjectLocationRequest.js";
import {validateProjectRegistrationRequest, ProjectRegistrationRequestInput} from "./validateProjectRegistrationRequest.js";
import {validateProjectRelocationRequest, ProjectRelocationRequestInput} from "./validateProjectRelocationRequest.js";
import {validatePlaySessionRequest, PlaySessionRequestInput} from "./runtime/validatePlaySessionRequest.js";
import {validatePlayFindSymbolWinRequest, PlayFindSymbolWinRequestInput} from "./runtime/validatePlayFindSymbolWinRequest.js";
import {buildSimulationReportDownload, isReportDownloadFormat} from "./simulation/buildSimulationReportDownload.js";
import {StudioSimulationService} from "./simulation/StudioSimulationService.js";
import type {StudioSimulationReportDetail} from "./simulation/StudioSimulationJobView.js";
import type {StudioSimulationStatus} from "./simulation/StudioSimulationStatus.js";
import {validateSimulationRequest, SimulationRequestInput} from "./simulation/validateSimulationRequest.js";
import {StudioStakeEngineExportService} from "./stakeengine/StudioStakeEngineExportService.js";
import {validateStakeEngineExportRequest, StakeEngineExportRequestInput} from "./stakeengine/validateStakeEngineExportRequest.js";
import {
    validateStakeEngineExportValidateRequest,
    StakeEngineExportValidateRequestInput,
} from "./stakeengine/validateStakeEngineExportValidateRequest.js";
import type {StudioContext} from "./StudioContext.js";
import type {StudioServerHandling} from "./StudioServerHandling.js";
import type {StudioServerOptions} from "./StudioServerOptions.js";
import type {StudioToolHandling} from "./StudioToolHandling.js";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 3200;

// The one "unavailable" outcome that isn't about the server's own display -- see isLoopbackRequest's
// own doc comment for why this is reported instead of ever consulting nativePickerService for a remote
// caller. `reason` deliberately never mentions displays/zenity/kdialog -- those would be misleading (a
// remote caller can't tell whether it's *this* or a genuinely headless server without probing, and
// either way the fix is the same: use the Server filesystem browser fallback PathInput already opens).
const REMOTE_NATIVE_PICKER_UNAVAILABLE = {
    status: "unavailable" as const,
    reason: "Native folder/file dialogs are only available to a Studio session connecting from the same machine running its server.",
};

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
    private readonly fsBrowseService: StudioFsBrowseService;
    private readonly nativePickerService: StudioNativePickerService;
    // Gates the native picker endpoints below to a "confirmed local" caller -- see isLoopbackRequest's
    // own doc comment. Injectable (defaults to the real isLoopbackRequest) since a test's own HTTP
    // client always connects over loopback, the same as a genuinely local caller, so exercising the
    // remote-rejection path needs a way to say "treat this request as remote" without a real remote
    // peer.
    private readonly isLoopbackRequest: (req: IncomingMessage) => boolean;
    // Backs POST /api/home/fs/open-folder -- opens a build's own output directory in the OS file
    // manager, on the machine running Studio's server. Gated by isLoopbackRequest exactly like
    // nativePickerService above (also a real OS command), so a remote Studio session can never trigger
    // it. Defaults to the real openInFileManager; overridable in tests so no real OS command is ever
    // spawned.
    private readonly openFolder: (folderPath: string) => void;
    private readonly blueprintService: StudioBlueprintService;
    private readonly loadGame: typeof loadPokieGame;
    // Crosses from "the projectRoot a direct `pokie <path>`/`pokie studio <path>` launch was given" to
    // "a real, loadable runtime" before startProjectDashboardLoad() ever touches loadGame -- same
    // materializing boundary playService's own resolver crosses (see materializeRuntimePackage.ts),
    // operation STUDIO_OPERATION since opening a project into the Dashboard needs exactly the same
    // "runtime.execute" capability Play does. StudioHomeService carries its own, separate copy of this
    // same kind of resolver for the /api/home/projects/open path -- see its own constructor.
    private readonly resolveRuntimePackageRoot: RuntimePackageResolving;
    // Answers "what is this project itself" (type/capabilities/origin) for startProjectDashboardLoad()'s
    // own loadProjectDashboardContext call -- bound to projectRegistrationService below (set after it,
    // in the constructor body) rather than constructed independently, so the Dashboard's own project
    // identity is always resolved through the same registry/resolver every other Studio Projects flow
    // already uses.
    private readonly describeProjectLocation: ProjectLocationDescribing;
    private readonly gamePackageInspector: GamePackageInspecting;
    private readonly gamePackageValidator: PokieGamePackageValidating;
    // Backs inspectOutcomeSourceProject/validateOutcomeSourceProject -- the exact same canonical-reader
    // dispatch loadProjectDashboardContext's own default already uses for the Project Dashboard's
    // "outcome-source" state, so Inspect/Validate never re-implement "how to read an outcomeLibrary/
    // stakeAdapter project" a second time.
    private readonly outcomeSourceProjectAnalyzer: OutcomeSourceProjectAnalyzing;
    private readonly simulationService: StudioSimulationService;
    private readonly replayService: StudioReplayExecutionService;
    // The one shared history every round-producing action across Studio records into -- see
    // StudioRoundRecorder's own doc comment. Shared with playService below (unless a caller supplied its
    // own, see StudioServerOptions.roundRecorder's own doc comment) and used directly by this class's own
    // outcome-source sample route and handleListRecentSpins().
    private readonly roundRecorder: StudioRoundRecorder;
    private readonly playService: StudioPlayService;
    private readonly deploymentService: StudioDeploymentService;
    private readonly outcomeLibraryGenerateService: StudioOutcomeLibraryGenerateService;
    private readonly certificationService: StudioCertificationService;
    private readonly fairnessService: StudioFairnessService;
    private readonly stakeEngineExportService: StudioStakeEngineExportService;
    private readonly artifactBuildService: StudioArtifactBuildService;
    // The persistent Studio project registry -- see StudioServerOptions.projectRegistrationService's own
    // doc comment for the default's FileStudioProjectRegistry-vs-app-data-unresolved fallback story.
    private readonly projectRegistrationService: StudioProjectRegistrationService;
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
        this.fsBrowseService = options.fsBrowseService ?? new StudioFsBrowseService(this.studioRoot);
        this.nativePickerService = options.nativePickerService ?? new StudioNativePickerService();
        this.isLoopbackRequest = options.isLoopbackRequest ?? isLoopbackRequest;
        this.openFolder = options.openFolder ?? openInFileManager;
        this.blueprintService = options.blueprintService;
        this.loadGame = options.loadGame ?? loadPokieGame;
        this.resolveRuntimePackageRoot = options.resolveRuntimePackageRoot ?? createMaterializingRuntimePackageResolver(this.pokieVersion, STUDIO_OPERATION);
        this.gamePackageInspector = options.gamePackageInspector ?? new GamePackageInspector();
        this.gamePackageValidator = options.gamePackageValidator ?? new PokieGamePackageValidator();
        this.outcomeSourceProjectAnalyzer = options.outcomeSourceProjectAnalyzer ?? new OutcomeSourceProjectAnalyzer();
        // Every default Project execution service loads through the same materializing boundary as
        // Play. This makes a Blueprint save observable on the next simulation/replay/generation
        // instead of letting those paths load an earlier package-shaped interpretation of the path.
        const loadCurrentProjectGame: typeof loadPokieGame = async (projectRoot) => {
            const resolution = await this.resolveRuntimePackageRoot(projectRoot);
            try {
                return await this.loadGame(resolution.runtimePath);
            } finally {
                await resolution.release();
            }
        };
        this.simulationService =
            options.simulationService ??
            new StudioSimulationService(undefined, this.loadGame, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, this.resolveRuntimePackageRoot);
        this.replayService =
            options.replayService ??
            new StudioReplayExecutionService(undefined, loadCurrentProjectGame, undefined, undefined, undefined, undefined, this.pokieVersion, (record) =>
                this.recordSimulationSampleReplay(record),
            );
        this.roundRecorder = options.roundRecorder ?? new StudioRoundRecorder();
        this.playService =
            options.playService ??
            new StudioPlayService(this.loadGame, this.resolveRuntimePackageRoot, this.pokieVersion, undefined, undefined, undefined, this.roundRecorder);
        this.deploymentService = options.deploymentService ?? new StudioDeploymentService();
        this.outcomeLibraryGenerateService = options.outcomeLibraryGenerateService ?? new StudioOutcomeLibraryGenerateService(this.pokieVersion, loadCurrentProjectGame);
        this.certificationService = options.certificationService ?? new StudioCertificationService(this.pokieVersion);
        this.fairnessService = options.fairnessService ?? new StudioFairnessService();
        this.stakeEngineExportService =
            options.stakeEngineExportService ?? new StudioStakeEngineExportService(this.pokieVersion, undefined, undefined, undefined, undefined, undefined, undefined, async (projectRoot) => {
                const game = await loadCurrentProjectGame(projectRoot);
                return game.getConfigHash?.();
            });
        this.artifactBuildService = options.artifactBuildService ?? new StudioArtifactBuildService(this.pokieVersion);
        this.projectRegistrationService = options.projectRegistrationService ?? createDefaultStudioProjectRegistrationService();
        this.describeProjectLocation = (location) => this.projectRegistrationService.describeLocation(location);
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
                // Also deliberately not awaited, same reasoning as the dashboard load above -- see
                // migrateRecentProjectsToRegistry's own doc comment.
                this.migrateRecentProjectsToRegistry();
                resolve({host: this.host, port: address.port});
            });
        });
    }

    public stop(): Promise<void> {
        // Best-effort, synchronous, before anything else: a simulation's/replay's chunked run loop
        // (see StudioSimulationService.run()/StudioReplayExecutionService.run()) is scheduled
        // independently of any HTTP connection, so closing the server alone would leave either running
        // against an event loop nobody is serving requests on anymore.
        this.simulationService.cancelAll();
        this.replayService.cancelAll();
        // Never holds an OS port (see StudioPlayService's own doc comment), but still discards whatever
        // session was active.
        this.playService.reset();
        // Every recorded round, from any tab, refers to a session/game this shutdown is about to make
        // unreachable -- see StudioRoundRecorder.clearAll()'s own doc comment.
        this.roundRecorder.clearAll();
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
    // the call. StudioSimulationService/StudioReplayExecutionService jobs are otherwise only ever stopped
    // on full Studio shutdown (see stop() above) — they're scoped by projectRoot so a job for a project
    // you've switched away from is never *reachable* through this project's own routes again, but
    // "unreachable" isn't "stopped": without this, its chunk loop would keep running in the background
    // indefinitely, wasting CPU for a result nothing can ever read.
    private cancelActiveJobsForOldProject(): void {
        if (this.currentContext.mode !== "project") {
            return;
        }
        this.simulationService.cancelActiveForProject(this.currentContext.projectRoot);
        this.replayService.cancelActiveForProject(this.currentContext.projectRoot);
    }

    // Every field is a primitive already safe to expose — no stack traces, env vars, tokens, or service
    // instances: studioVersion/nodeVersion/uptimeSeconds are ordinary version/process facts, mode/
    // projectRoot mirror what /api/context already returns to the client, the two active-job counts are
    // plain numbers (see StudioSimulationService/StudioReplayExecutionService's own getActiveCount()),
    // and recentProjectStoragePath is a fixed literal describing InMemoryRecentProjectsRepository's
    // actual (non-persistent) storage — never a real filesystem path, since there isn't one.
    private buildDiagnostics(): StudioDiagnosticsView {
        return {
            studioVersion: this.pokieVersion,
            nodeVersion: process.version,
            mode: this.currentContext.mode,
            projectRoot: this.currentContext.mode === "project" ? this.currentContext.projectRoot : undefined,
            activeSimulationCount: this.simulationService.getActiveCount(),
            activeReplayCount: this.replayService.getActiveCount(),
            recentProjectStoragePath: "in-memory (no persistent path)",
            uptimeSeconds: process.uptime(),
        };
    }

    private startProjectDashboardLoad(projectRoot: string): void {
        this.projectDashboard = {status: "loading", projectRoot};
        loadProjectDashboardContext(projectRoot, this.loadGame, this.resolveRuntimePackageRoot, this.describeProjectLocation)
            .then((dashboard) => {
                this.projectDashboard = dashboard;
            })
            .catch(() => {
                // loadProjectDashboardContext itself never rejects (it catches internally) — this is
                // an extra safety net only, so a StudioServer never crashes on a background load.
            });
    }

    // A one-time sync of Home's own (never-persisted, process-lifetime) recent-projects list into the
    // persistent project registry -- see StudioProjectRegistrationService.migrateRecentProjects's own
    // doc comment for why this matters and why it's safe to run on every startup. Fire-and-forget for
    // the same reason startProjectDashboardLoad above is: the HTTP server must be reachable immediately,
    // not block startup on this best-effort bookkeeping.
    private migrateRecentProjectsToRegistry(): void {
        this.homeService
            .listRecentProjects()
            .then((recentProjects) => this.projectRegistrationService.migrateRecentProjects(recentProjects))
            .catch(() => {
                // Best-effort only -- a migration failure must never crash Studio's own startup.
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

        if (method === "GET" && url.pathname === "/api/home/projects/registry") {
            this.sendJson(res, 200, await this.projectRegistrationService.list());
            return;
        }

        if (method === "POST" && url.pathname === "/api/home/projects/registry/preview") {
            await this.handleHomeProjectRegistryPreview(req, res);
            return;
        }

        if (method === "POST" && url.pathname === "/api/home/projects/registry/register") {
            await this.handleHomeProjectRegistryRegister(req, res);
            return;
        }

        if (method === "POST" && url.pathname === "/api/home/projects/registry/remove") {
            await this.handleHomeProjectRegistryRemove(req, res);
            return;
        }

        if (method === "POST" && url.pathname === "/api/home/projects/registry/relocate") {
            await this.handleHomeProjectRegistryRelocate(req, res);
            return;
        }

        if (method === "POST" && url.pathname === "/api/home/projects/open") {
            await this.handleHomeOpenProject(req, res);
            return;
        }

        if (method === "GET" && url.pathname === "/api/home/fs/browse") {
            this.handleHomeFsBrowse(res, url);
            return;
        }

        if (method === "GET" && url.pathname === "/api/home/fs/default-location") {
            this.handleHomeFsDefaultLocation(res, url);
            return;
        }

        if (method === "GET" && url.pathname === "/api/home/fs/native-browse/availability") {
            this.sendJson(res, 200, this.isLoopbackRequest(req) ? this.nativePickerService.checkAvailability() : REMOTE_NATIVE_PICKER_UNAVAILABLE);
            return;
        }

        if (method === "POST" && url.pathname === "/api/home/fs/native-browse") {
            await this.handleHomeFsNativeBrowse(req, res);
            return;
        }

        if (method === "POST" && url.pathname === "/api/home/fs/open-folder") {
            await this.handleHomeFsOpenFolder(req, res);
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

        if (method === "POST" && url.pathname === "/api/home/blueprints/check-source") {
            await this.handleBlueprintCheckSource(req, res);
            return;
        }

        if (method === "POST" && url.pathname === "/api/home/blueprints/random") {
            await this.handleBlueprintRandom(req, res);
            return;
        }

        if (method === "POST" && url.pathname === "/api/home/blueprints/save") {
            await this.handleBlueprintSave(req, res);
            return;
        }

        if (method === "POST" && url.pathname === "/api/home/blueprints/save-managed") {
            await this.handleBlueprintSaveManaged(req, res);
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

        if (method === "POST" && url.pathname === "/api/home/blueprints/game-model-preview") {
            await this.handleBlueprintGameModelPreview(req, res);
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
            // Simulation/Replay jobs for the project being left are cancelled too — see
            // cancelActiveJobsForOldProject()'s own doc comment for why this can't just rely on their
            // existing projectRoot scoping alone.
            this.playService.reset();
            // Same reasoning as stop()'s own call -- every recorded round refers to a session/game in the
            // project being left.
            this.roundRecorder.clearAll();
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
            await this.handleInspectProject(res);
            return;
        }

        if (method === "GET" && url.pathname === "/api/project/validate") {
            await this.handleValidateProject(res);
            return;
        }

        if (method === "GET" && url.pathname === "/api/project/gameModel") {
            await this.handleGameModel(res, url);
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

        if (method === "GET" && url.pathname === "/api/project/rounds") {
            this.handleListRecentSpins(res);
            return;
        }

        if (method === "POST" && url.pathname === "/api/project/play/session") {
            await this.handlePlayNewSession(req, res);
            return;
        }

        const playSpinSessionId = this.matchPlaySpinRoute(url.pathname);
        if (playSpinSessionId !== undefined && method === "POST") {
            await this.handlePlaySpin(res, playSpinSessionId);
            return;
        }

        const playFindAnyWinSessionId = this.matchPlayFindAnyWinRoute(url.pathname);
        if (playFindAnyWinSessionId !== undefined && method === "POST") {
            await this.handlePlayFindAnyWin(res, playFindAnyWinSessionId);
            return;
        }

        const playFindSymbolWinSessionId = this.matchPlayFindSymbolWinRoute(url.pathname);
        if (playFindSymbolWinSessionId !== undefined && method === "POST") {
            await this.handlePlayFindSymbolWin(req, res, playFindSymbolWinSessionId);
            return;
        }

        const playFindFreeGamesSessionId = this.matchPlayFindFreeGamesRoute(url.pathname);
        if (playFindFreeGamesSessionId !== undefined && method === "POST") {
            await this.handlePlayFindFreeGames(res, playFindFreeGamesSessionId);
            return;
        }

        if (method === "GET" && url.pathname === "/api/project/deployment/targets") {
            this.handleListDeploymentTargets(res);
            return;
        }

        if (method === "GET" && url.pathname === "/api/project/deployment/build-modes") {
            await this.handleGetDeploymentBuildModes(res);
            return;
        }

        if (method === "POST" && url.pathname === "/api/project/deployment/runs") {
            await this.handleRunDeployment(req, res);
            return;
        }

        if (method === "POST" && url.pathname === "/api/project/outcome-libraries/generate/estimate") {
            await this.handleEstimateOutcomeLibraryGeneration(req, res);
            return;
        }

        if (method === "POST" && url.pathname === "/api/project/outcome-libraries/generate") {
            await this.handleGenerateOutcomeLibrary(req, res);
            return;
        }

        if (method === "GET" && url.pathname === "/api/project/outcome-libraries/registry") {
            await this.handleGetOutcomeLibraryRegistry(res);
            return;
        }

        if (method === "POST" && url.pathname === "/api/project/outcome-source/sample") {
            await this.handleOutcomeSourceSample(req, res);
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

        if (method === "POST" && url.pathname === "/api/project/stakeengine/validate") {
            await this.handleValidateStakeEngineExport(req, res);
            return;
        }

        if (method === "POST" && url.pathname === "/api/project/stakeengine/export") {
            await this.handleExportStakeEngine(req, res);
            return;
        }

        if (method === "GET" && url.pathname === "/api/project/artifacts/targets") {
            await this.handleListArtifactTargets(res);
            return;
        }

        if (method === "POST" && url.pathname === "/api/project/artifacts/preview") {
            await this.handlePreviewArtifact(req, res);
            return;
        }

        if (method === "POST" && url.pathname === "/api/project/artifacts/build") {
            await this.handleBuildArtifact(req, res);
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

    private matchPlaySpinRoute(pathname: string): string | undefined {
        const segments = pathname.split("/").filter((segment) => segment.length > 0);
        if (
            segments.length === 6 &&
            segments[0] === "api" &&
            segments[1] === "project" &&
            segments[2] === "play" &&
            segments[3] === "sessions" &&
            segments[5] === "spin"
        ) {
            return decodeURIComponent(segments[4]);
        }
        return undefined;
    }

    private matchPlayFindAnyWinRoute(pathname: string): string | undefined {
        const segments = pathname.split("/").filter((segment) => segment.length > 0);
        if (
            segments.length === 6 &&
            segments[0] === "api" &&
            segments[1] === "project" &&
            segments[2] === "play" &&
            segments[3] === "sessions" &&
            segments[5] === "find-any-win"
        ) {
            return decodeURIComponent(segments[4]);
        }
        return undefined;
    }

    private matchPlayFindSymbolWinRoute(pathname: string): string | undefined {
        const segments = pathname.split("/").filter((segment) => segment.length > 0);
        if (
            segments.length === 6 &&
            segments[0] === "api" &&
            segments[1] === "project" &&
            segments[2] === "play" &&
            segments[3] === "sessions" &&
            segments[5] === "find-symbol-win"
        ) {
            return decodeURIComponent(segments[4]);
        }
        return undefined;
    }

    private matchPlayFindFreeGamesRoute(pathname: string): string | undefined {
        const segments = pathname.split("/").filter((segment) => segment.length > 0);
        if (
            segments.length === 6 &&
            segments[0] === "api" &&
            segments[1] === "project" &&
            segments[2] === "play" &&
            segments[3] === "sessions" &&
            segments[5] === "find-free-games"
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
    // legitimately failed at the domain level is not a failed HTTP request.

    // Import Project's own "detect" step -- read-only, never registers anything (see
    // StudioProjectRegistrationService.previewImport's own doc comment). Always 200, even for
    // "unrecognized" -- that's an ordinary outcome of pointing detection at an arbitrary path, not a
    // failed request.
    private async handleHomeProjectRegistryPreview(req: IncomingMessage, res: ServerResponse): Promise<void> {
        const body = await this.readJsonBody(req);
        let validated;
        try {
            validated = validateProjectLocationRequest((body ?? {}) as ProjectLocationRequestInput);
        } catch (error) {
            this.sendJson(res, 400, {error: error instanceof Error ? error.message : String(error)});
            return;
        }

        this.sendJson(res, 200, await this.projectRegistrationService.previewImport(validated.location));
    }

    // Import Project's own "register" step -- always origin "external" (see
    // StudioProjectRegistrationService.registerExternal's own doc comment); a managed project is only
    // ever registered internally by Studio itself.
    private async handleHomeProjectRegistryRegister(req: IncomingMessage, res: ServerResponse): Promise<void> {
        const body = await this.readJsonBody(req);
        let validated;
        try {
            validated = validateProjectRegistrationRequest((body ?? {}) as ProjectRegistrationRequestInput);
        } catch (error) {
            this.sendJson(res, 400, {error: error instanceof Error ? error.message : String(error)});
            return;
        }

        const result = await this.projectRegistrationService.registerExternal(validated.location, validated.name);
        this.sendJson(res, result.status === "ok" ? 201 : 200, result);
    }

    private async handleHomeProjectRegistryRemove(req: IncomingMessage, res: ServerResponse): Promise<void> {
        const body = await this.readJsonBody(req);
        let validated;
        try {
            validated = validateProjectLocationRequest((body ?? {}) as ProjectLocationRequestInput);
        } catch (error) {
            this.sendJson(res, 400, {error: error instanceof Error ? error.message : String(error)});
            return;
        }

        await this.projectRegistrationService.remove(validated.location);
        this.sendJson(res, 200, {status: "ok"});
    }

    private async handleHomeProjectRegistryRelocate(req: IncomingMessage, res: ServerResponse): Promise<void> {
        const body = await this.readJsonBody(req);
        let validated;
        try {
            validated = validateProjectRelocationRequest((body ?? {}) as ProjectRelocationRequestInput);
        } catch (error) {
            this.sendJson(res, 400, {error: error instanceof Error ? error.message : String(error)});
            return;
        }

        this.sendJson(res, 200, await this.projectRegistrationService.relocate(validated.location, validated.newLocation));
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
        // "loaded", "outcome-source", or "error" — "empty"/"loading" are exclusively synthesized
        // elsewhere in this class. A resolved "outcomeLibrary"/"stakeAdapter" project opens straight
        // into its own canonical-reader-backed dashboard (see ProjectDashboardContext's own doc
        // comment) rather than failing here the way it always used to before that status existed —
        // neither type ever gains a `game` manifest to report back.
        const dashboard = await this.homeService.openProject(validated.projectRoot);
        if (dashboard.status !== "loaded" && dashboard.status !== "outcome-source") {
            const message = dashboard.status === "error" ? dashboard.error : `Could not load "${validated.projectRoot}".`;
            // "detail" -- e.g. a failed materialization "npm install"'s own raw stderr (see
            // ProjectDashboardContext's own doc comment on "errorDetail") -- rides alongside the primary
            // human-readable "error" as its own field, never folded into it, so a client can offer it as
            // expandable diagnostic detail instead of always rendering a wall of npm output up front.
            const detail = dashboard.status === "error" ? dashboard.errorDetail : undefined;
            this.sendJson(res, 400, {error: message, detail});
            return;
        }

        // Reset only now that the new project's dashboard has actually loaded — a *failed* open never
        // strands the previous project's Play session prematurely. Same reasoning as the
        // /api/projects/close branch's own call.
        this.playService.reset();
        // Same reasoning as stop()'s own call -- every recorded round refers to a session/game in the
        // project being left.
        this.roundRecorder.clearAll();
        this.cancelActiveJobsForOldProject();

        // The explicit Home → Project Studio context transition: mutates this same running server's
        // state in place — no new HTTP server or Studio process is ever started (see the class-level
        // doc comment).
        this.currentContext = {mode: "project", projectRoot: dashboard.projectRoot};
        this.projectDashboard = dashboard;
        // Opening is a first-class Project lifecycle event, not merely a recent-project hint.  Record it
        // only after the dashboard was successfully loaded, preserving a managed entry's origin while
        // making an ad-hoc Open as Project durable and most-recent in the same registry Home renders.
        await this.projectRegistrationService.recordOpened(
            dashboard.projectRoot,
            dashboard.status === "loaded" ? dashboard.game.name : path.basename(dashboard.projectRoot),
        );
        this.sendJson(res, 200, {context: this.currentContext, manifest: dashboard.status === "loaded" ? dashboard.game : undefined});
    }

    // Always 200: same "a well-formed request that fails at the domain level isn't a failed HTTP
    // request" reasoning as GET /api/project/validate -- a nonexistent/unreadable/non-directory path is
    // an expected outcome of a user typing or navigating anywhere on disk, carried in the DTO's own
    // `status` field (see StudioFsBrowseView) rather than an HTTP error status.
    private handleHomeFsBrowse(res: ServerResponse, url: URL): void {
        const requestedPath = url.searchParams.get("path");
        const base = url.searchParams.get("base");
        const kindParam = url.searchParams.get("kind");
        const kind = kindParam === "file" || kindParam === "any" ? kindParam : "directory";
        this.sendJson(res, 200, this.fsBrowseService.browse(requestedPath ?? undefined, base ?? undefined, kind));
    }

    // Always 200, same "a well-formed request with no useful answer isn't a failed request" reasoning as
    // handleHomeFsBrowse above -- see StudioDefaultLocationView's own doc comment for why every failure
    // mode collapses to a single "unavailable".
    private handleHomeFsDefaultLocation(res: ServerResponse, url: URL): void {
        const name = url.searchParams.get("name");
        this.sendJson(res, 200, this.homeService.resolveDefaultBrowseLocation(name ?? undefined));
    }

    // Unlike handleHomeFsBrowse, a *malformed* request (a missing/invalid "kind") is a real 400 -- the
    // caller (PathInput) always sends a well-formed request; the only domain-level outcomes belong to
    // StudioNativePickerResultView's own status field (selected/cancelled/unavailable/error), same
    // convention as every other Home POST handler in this class. Gated the same way as the availability
    // check above: a non-loopback caller never reaches nativePickerService.pick() at all, so a remote
    // browser can never pop a dialog on the server's own screen even if it calls this endpoint directly
    // (bypassing PathInput's own availability check) -- see isLoopbackRequest's own doc comment.
    private async handleHomeFsNativeBrowse(req: IncomingMessage, res: ServerResponse): Promise<void> {
        const body = await this.readJsonBody(req);
        let validated;
        try {
            validated = validateNativeBrowseRequest((body ?? {}) as NativeBrowseRequestInput);
        } catch (error) {
            this.sendJson(res, 400, {error: error instanceof Error ? error.message : String(error)});
            return;
        }

        if (!this.isLoopbackRequest(req)) {
            this.sendJson(res, 200, REMOTE_NATIVE_PICKER_UNAVAILABLE);
            return;
        }

        this.sendJson(res, 200, await this.nativePickerService.pick(validated));
    }

    // Opens a build's output directory in the OS file manager, on the machine running Studio's server —
    // "Open output folder" on a successful Build/Rebuild. Gated by isLoopbackRequest exactly like
    // handleHomeFsNativeBrowse above (also a real OS command), and reported "unavailable" rather than
    // even attempting it for a remote caller — see that handler's own doc comment. Unlike the native
    // picker, this never pops a dialog to cancel; the only domain-level failure worth reporting is the
    // path not actually being a directory on this server, checked before openInFileManager (itself
    // fire-and-forget, see its own doc comment) is ever called.
    private async handleHomeFsOpenFolder(req: IncomingMessage, res: ServerResponse): Promise<void> {
        const body = await this.readJsonBody(req);
        let validated;
        try {
            validated = validateOpenFolderRequest((body ?? {}) as OpenFolderRequestInput);
        } catch (error) {
            this.sendJson(res, 400, {error: error instanceof Error ? error.message : String(error)});
            return;
        }

        if (!this.isLoopbackRequest(req)) {
            this.sendJson(res, 200, {
                status: "unavailable",
                reason: "Opening a folder is only available to a Studio session connecting from the same machine running its server.",
            });
            return;
        }

        if (!fs.existsSync(validated.path) || !fs.statSync(validated.path).isDirectory()) {
            this.sendJson(res, 200, {status: "error", message: `"${validated.path}" does not exist or is not a directory.`});
            return;
        }

        this.openFolder(validated.path);
        this.sendJson(res, 200, {status: "ok"});
    }

    // The Blueprint Editor handlers below follow the same validate-then-delegate shape as the Home
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

    // Backs BlueprintEditorPage's own background source-check (see StudioBlueprintService.checkSource's
    // own doc comment) -- a caller that already loaded/saved a path and holds its own blueprintHash asks
    // whether the persisted source has since changed externally, without re-sending or re-diffing the
    // full content itself.
    private async handleBlueprintCheckSource(req: IncomingMessage, res: ServerResponse): Promise<void> {
        const body = await this.readJsonBody(req);
        let validated;
        try {
            validated = validateCheckBlueprintSourceRequest((body ?? {}) as CheckBlueprintSourceRequestInput);
        } catch (error) {
            this.sendJson(res, 400, {error: error instanceof Error ? error.message : String(error)});
            return;
        }

        this.sendJson(res, 200, this.blueprintService.checkSource(validated.path, validated.blueprintHash));
    }

    private async handleBlueprintRandom(req: IncomingMessage, res: ServerResponse): Promise<void> {
        const body = await this.readJsonBody(req);
        let validated;
        try {
            validated = validateBlueprintRandomRequest((body ?? {}) as BlueprintRandomRequestInput);
        } catch (error) {
            this.sendJson(res, 400, {error: error instanceof Error ? error.message : String(error)});
            return;
        }

        this.sendJson(res, 200, this.blueprintService.random(validated.seed, validated.preset, validated.name));
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

        const result = this.blueprintService.save(validated.path, validated.blueprint, validated.overwrite, validated.expectedHash);
        if (result.status === "ok" && this.currentContext.mode === "project" && path.resolve(this.currentContext.projectRoot) === result.path) {
            // The Dashboard retains a loaded Project snapshot for its Overview. Refresh that snapshot
            // after an in-place Blueprint save so every Project-facing surface observes the newly
            // authoritative source, not the pre-save dashboard model.
            this.startProjectDashboardLoad(result.path);
        }
        this.sendJson(res, this.statusForBlueprintSave(result.status), result);
    }

    private statusForBlueprintSave(status: "ok" | "conflict" | "error"): number {
        if (status === "ok") {
            return 201;
        }
        return status === "conflict" ? 409 : 200;
    }

    // The guided Design Game editor's own "first Save" -- see StudioBlueprintService.saveManaged's own
    // doc comment for the path-choice policy. On "ok", registers the freshly-written file as a *managed*
    // Studio project (see StudioProjectRegistrationService.registerManaged's own doc comment) so it shows
    // up in the Projects tab the same way a `pokie create`/Build-from-Home project already does -- this
    // is the one caller-side step saveManaged() deliberately leaves to StudioServer rather than taking a
    // StudioProjectRegistrationService dependency of its own (same split as homeService.
    // rememberRecentProject() being called from here rather than from inside StudioBlueprintService).
    private async handleBlueprintSaveManaged(req: IncomingMessage, res: ServerResponse): Promise<void> {
        const body = await this.readJsonBody(req);
        let validated;
        try {
            validated = validateSaveManagedBlueprintRequest((body ?? {}) as SaveManagedBlueprintRequestInput);
        } catch (error) {
            this.sendJson(res, 400, {error: error instanceof Error ? error.message : String(error)});
            return;
        }

        const result = this.blueprintService.saveManaged(validated.blueprint, validated.sourceWorkbookPath);
        if (result.status === "ok") {
            await this.projectRegistrationService.registerManaged(result.path, result.name, result.sourceWorkbookPath);
        }
        this.sendJson(res, result.status === "ok" ? 201 : 200, result);
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

    // Same request shape as /validate (just "blueprint"), plus an optional "sharedWeightsSampleSeed" --
    // reuses validateBlueprintValidationRequest rather than a near-duplicate validator for the required
    // "blueprint" field; the seed is optional and purely re-rolls a "symbolWeights"/"default" blueprint's
    // own dynamic inspection sample (see StudioBlueprintService.previewGameModel's own doc comment), so an
    // absent/malformed value just falls back to the default sample rather than a 400. Backs the guided
    // Design Game editor's own live Game Model preview, including its own "New sample" action.
    private async handleBlueprintGameModelPreview(req: IncomingMessage, res: ServerResponse): Promise<void> {
        const body = await this.readJsonBody(req);
        let validated;
        try {
            validated = validateBlueprintValidationRequest((body ?? {}) as BlueprintValidationRequestInput);
        } catch (error) {
            this.sendJson(res, 400, {error: error instanceof Error ? error.message : String(error)});
            return;
        }

        const seed = (body as {sharedWeightsSampleSeed?: unknown} | null)?.sharedWeightsSampleSeed;
        this.sendJson(res, 200, this.blueprintService.previewGameModel(validated.blueprint, typeof seed === "number" ? seed : undefined));
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

    // Resolves `projectRoot`'s own PokieProject (see ProjectTargetResolver) so Inspect/Validate below
    // never assume `projectRoot` is a package directory the way they always used to -- a "blueprint"
    // `projectRoot` is a single JSON file, and probing `<blueprint.json>/package.json` against it
    // throws ENOTDIR rather than reporting a normal "invalid" result; an "outcomeLibrary"/"stakeAdapter"
    // `projectRoot` has no package.json or loadable entry module at all. `undefined` on any resolution
    // failure (unrecognized, ambiguous, or a genuine I/O error) so both callers can safely fall back to
    // their existing tsPackage-oriented behavior -- exactly as before this awareness existed -- instead
    // of turning a resolution failure into an Inspect/Validate failure of its own.
    private resolveOpenedProject(projectRoot: string): Promise<PokieProject | undefined> {
        return new ProjectTargetResolver().resolve(projectRoot).catch(() => undefined);
    }

    // A `projectRoot` that's a plain file (not a directory) is always treated as "blueprint", even when
    // resolveOpenedProject() itself came back empty -- e.g. a corrupt/malformed blueprint JSON fails
    // looksLikeGameBlueprintFile's own lightweight recognition (see ProjectTargetResolver's blueprint
    // adapter) and so resolves to `undefined`, not "blueprint". Falling through to the tsPackage-oriented
    // path in that case is exactly the bug this method exists to prevent: package.json-shaped Inspect/
    // Validate assume a directory, and a file `projectRoot` still hits the same ENOTDIR reading
    // `<projectRoot>/package.json`. A file can never legitimately be a package directory regardless of
    // what the resolver made of its contents, so this is a strict widening of "blueprint", not a new type.
    private isOpenedBlueprintProject(projectRoot: string, resolved: PokieProject | undefined): boolean {
        return resolved !== undefined ? resolved.type === "blueprint" : this.isFile(projectRoot);
    }

    private isFile(targetPath: string): boolean {
        try {
            return fs.statSync(targetPath).isFile();
        } catch {
            return false;
        }
    }

    private async handleInspectProject(res: ServerResponse): Promise<void> {
        if (this.currentContext.mode !== "project") {
            this.sendJson(res, 409, {error: "No active project."});
            return;
        }
        const projectRoot = this.currentContext.projectRoot;
        const resolved = await this.resolveOpenedProject(projectRoot);
        if (this.isOpenedBlueprintProject(projectRoot, resolved)) {
            this.sendJson(res, 200, this.inspectBlueprintProject(projectRoot));
            return;
        }
        if (resolved !== undefined && (resolved.type === "outcomeLibrary" || resolved.type === "stakeAdapter")) {
            this.sendJson(res, 200, await this.inspectOutcomeSourceProject(resolved));
            return;
        }
        this.sendJson(res, 200, this.gamePackageInspector.inspect(projectRoot));
    }

    private async handleValidateProject(res: ServerResponse): Promise<void> {
        if (this.currentContext.mode !== "project") {
            this.sendJson(res, 409, {error: "No active project."});
            return;
        }
        const projectRoot = this.currentContext.projectRoot;
        const resolved = await this.resolveOpenedProject(projectRoot);
        if (this.isOpenedBlueprintProject(projectRoot, resolved)) {
            this.sendJson(res, 200, this.validateBlueprintProject(projectRoot));
            return;
        }
        if (resolved !== undefined && (resolved.type === "outcomeLibrary" || resolved.type === "stakeAdapter")) {
            this.sendJson(res, 200, await this.validateOutcomeSourceProject(resolved));
            return;
        }
        this.sendJson(res, 200, await this.gamePackageValidator.validate(projectRoot));
    }

    // Inspect/Validate's own Game Model counterpart -- see buildProjectGameModel's own doc comment for
    // the exact resolved-project-type dispatch (blueprint / outcomeLibrary+stakeAdapter / wasm /
    // tsPackage-default) this delegates to. Always 200: a project whose game model isn't available (a
    // tsPackage/wasm/outcomeLibrary project, or a Blueprint that fails to load) reports that truthfully
    // in the projection's own per-section `reason`, never as an HTTP error -- same "well-formed request,
    // domain-level unavailability" reasoning as GET /api/project/validate. An optional
    // "sharedWeightsSampleSeed" query param re-rolls a "symbolWeights"/"default" blueprint's own dynamic
    // inspection sample (see buildProjectGameModel's own doc comment) for the Game Model Reels view's own
    // "New sample" action -- a malformed/absent value just falls back to the default sample.
    private async handleGameModel(res: ServerResponse, url: URL): Promise<void> {
        if (this.currentContext.mode !== "project") {
            this.sendJson(res, 409, {error: "No active project."});
            return;
        }
        const projectRoot = this.currentContext.projectRoot;
        const resolved = await this.resolveOpenedProject(projectRoot);
        const seedParam = url.searchParams.get("sharedWeightsSampleSeed");
        const seed = seedParam !== null && Number.isFinite(Number(seedParam)) ? Number(seedParam) : undefined;
        const projection = await buildProjectGameModel(
            projectRoot,
            resolved,
            this.isOpenedBlueprintProject(projectRoot, resolved),
            {
                loadBlueprint: (root) => this.blueprintService.load(root),
                inspectPackage: (root) => this.gamePackageInspector.inspect(root),
                readWasmManifest: readWasmComponentManifest,
            },
            seed,
        );
        this.sendJson(res, 200, projection);
    }

    // Inspect's own blueprint counterpart -- reuses StudioBlueprintService.load() (the same read/parse
    // the Blueprint Editor's own Load action runs) rather than a second, separate blueprint-file reader,
    // and reports the blueprint's own manifest fields in place of package.json's, since a blueprint
    // `projectRoot` has no package.json of its own to read.
    private inspectBlueprintProject(projectRoot: string): GamePackageInspectionReport {
        const loaded = this.blueprintService.load(projectRoot);
        if (loaded.status === "load-error") {
            return {packageRoot: projectRoot, valid: false, error: loaded.error};
        }
        return {packageRoot: projectRoot, valid: true, packageJson: readBlueprintManifest(loaded.blueprint)};
    }

    // Validate's own blueprint counterpart -- runs GameBlueprintValidator (via StudioBlueprintService.
    // validate(), the exact same call the Blueprint Editor's own Validate action makes) against the
    // parsed blueprint instead of PokieGamePackageValidator, which requires a loadable entry module a
    // blueprint `projectRoot` doesn't have. Shaped as a PokieGamePackageValidationReport so Overview's
    // existing validation diagnostics render it exactly as they already do for a tsPackage project.
    private validateBlueprintProject(projectRoot: string): PokieGamePackageValidationReport {
        const loaded = this.blueprintService.load(projectRoot);
        if (loaded.status === "load-error") {
            return {
                packageRoot: projectRoot,
                valid: false,
                game: null,
                errors: [{code: "blueprint-load-failed", severity: "error", message: loaded.error}],
                warnings: [],
                suggestions: [],
            };
        }

        const validated = this.blueprintService.validate(loaded.blueprint);
        const errors = validated.status === "invalid" ? validated.errors : [];
        const warnings = validated.warnings;
        const suggestions = [
            ...new Set([...errors, ...warnings].map((issue) => issue.suggestion).filter((suggestion): suggestion is string => Boolean(suggestion))),
        ];
        return {
            packageRoot: projectRoot,
            valid: errors.length === 0,
            game: readBlueprintGameIdentity(loaded.blueprint),
            errors,
            warnings,
            suggestions,
        };
    }

    // Inspect's own "outcomeLibrary"/"stakeAdapter" counterpart -- dispatches through
    // OutcomeSourceProjectAnalyzer to each type's own canonical reader (OutcomeLibraryBundleReading/
    // StakeEngineOutcomeSourceReading, see that class's own doc comment) instead of GamePackageInspector,
    // which assumes a package.json-bearing directory neither type has.
    private async inspectOutcomeSourceProject(project: PokieProject): Promise<GamePackageInspectionReport> {
        const report = await this.outcomeSourceProjectAnalyzer.analyze(project);
        const errorIssue = report.issues.find((issue) => issue.severity === "error");
        if (errorIssue !== undefined) {
            return {packageRoot: report.rootPath, valid: false, error: errorIssue.message};
        }
        return {packageRoot: report.rootPath, valid: true};
    }

    // Validate's own "outcomeLibrary"/"stakeAdapter" counterpart -- runs the exact same
    // OutcomeSourceProjectAnalyzer.analyze() call as inspectOutcomeSourceProject above instead of
    // PokieGamePackageValidator, which requires a loadable entry module neither an outcome-library bundle
    // nor a Stake Engine export directory has. Shaped as a PokieGamePackageValidationReport so Overview's
    // existing validation diagnostics render it exactly as they already do for a tsPackage/blueprint
    // project. "game" is always null: neither canonical reader resolves a game identity of its own (see
    // OutcomeSourceProjectReport's own doc comment).
    private async validateOutcomeSourceProject(project: PokieProject): Promise<PokieGamePackageValidationReport> {
        const report = await this.outcomeSourceProjectAnalyzer.analyze(project);
        const errors = report.issues.filter((issue) => issue.severity === "error");
        const warnings = report.issues.filter((issue) => issue.severity !== "error");
        const suggestions = [
            ...new Set([...errors, ...warnings].map((issue) => issue.suggestion).filter((suggestion): suggestion is string => Boolean(suggestion))),
        ];
        return {
            packageRoot: report.rootPath,
            valid: errors.length === 0,
            game: null,
            errors,
            warnings,
            suggestions,
        };
    }

    private handleListDeploymentTargets(res: ServerResponse): void {
        if (this.currentContext.mode !== "project") {
            this.sendJson(res, 409, {error: "No active project."});
            return;
        }
        this.sendJson(res, 200, this.deploymentService.listTargets(this.currentContext.projectRoot));
    }

    private async handleGetDeploymentBuildModes(res: ServerResponse): Promise<void> {
        if (this.currentContext.mode !== "project") {
            this.sendJson(res, 409, {error: "No active project."});
            return;
        }
        this.sendJson(res, 200, await this.deploymentService.getBuildModes(this.currentContext.projectRoot));
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
        if (result.status === "invalid-modes" || result.status === "load-error") {
            this.sendJson(res, 400, {error: result.error});
            return;
        }
        this.sendJson(res, 200, result.view);
    }

    private async handleEstimateOutcomeLibraryGeneration(req: IncomingMessage, res: ServerResponse): Promise<void> {
        if (this.currentContext.mode !== "project") {
            this.sendJson(res, 409, {error: "No active project."});
            return;
        }

        const body = await this.readJsonBody(req);
        let validated;
        try {
            validated = validateOutcomeLibraryGenerateEstimateRequest((body ?? {}) as OutcomeLibraryGenerateEstimateRequestInput);
        } catch (error) {
            this.sendJson(res, 400, {error: error instanceof Error ? error.message : String(error)});
            return;
        }

        this.sendJson(res, 200, await this.outcomeLibraryGenerateService.estimate(this.currentContext.projectRoot, validated));
    }

    private async handleGenerateOutcomeLibrary(req: IncomingMessage, res: ServerResponse): Promise<void> {
        if (this.currentContext.mode !== "project") {
            this.sendJson(res, 409, {error: "No active project."});
            return;
        }

        const body = await this.readJsonBody(req);
        let validated;
        try {
            validated = validateOutcomeLibraryGenerateRequest((body ?? {}) as OutcomeLibraryGenerateRequestInput);
        } catch (error) {
            this.sendJson(res, 400, {error: error instanceof Error ? error.message : String(error)});
            return;
        }

        this.sendJson(res, 200, await this.outcomeLibraryGenerateService.generate(this.currentContext.projectRoot, validated));
    }

    private async handleGetOutcomeLibraryRegistry(res: ServerResponse): Promise<void> {
        if (this.currentContext.mode !== "project") {
            this.sendJson(res, 409, {error: "No active project."});
            return;
        }

        this.sendJson(res, 200, await this.outcomeLibraryGenerateService.registry(this.currentContext.projectRoot));
    }

    // Draws exactly one outcome from the currently open "outcomeLibrary" project through
    // sampleOutcomeSourceProject -- the same OutcomeLibraryBundleOutcomeSource selector class
    // PreGeneratedSpinCommandHandler already wires in production, never loadPokieGame or a re-derived
    // game-model draw (see that function's own doc comment). This is the native "play" route for a
    // project resolved straight to "outcomeLibrary"/"stakeAdapter" (see loadProjectDashboardContext's
    // own "outcome-source" status) -- a currently open "stakeAdapter" project has no draw contract of
    // its own, so this always resolves to `{supported: false, diagnostic}` for one instead of throwing
    // or ever attempting package-runtime execution (loadGame is never touched by this handler). Always
    // 200: same "a well-formed request that fails at the domain level isn't a
    // failed HTTP request" reasoning as GET /api/project/validate -- the unsupported-capability outcome
    // is carried in the response body's own `supported` field, not an HTTP error status.
    private async handleOutcomeSourceSample(req: IncomingMessage, res: ServerResponse): Promise<void> {
        if (this.currentContext.mode !== "project" || this.projectDashboard?.status !== "outcome-source") {
            this.sendJson(res, 409, {error: "No active outcome-source project."});
            return;
        }

        const body = await this.readJsonBody(req);
        let validated;
        try {
            validated = validateOutcomeSourceSampleRequest((body ?? {}) as OutcomeSourceSampleRequestInput);
        } catch (error) {
            this.sendJson(res, 400, {error: error instanceof Error ? error.message : String(error)});
            return;
        }

        const randomSource =
            validated.seed !== undefined ? new SeededWeightedOutcomeRandomSource(validated.seed) : new SecureWeightedOutcomeRandomSource();
        const result = await sampleOutcomeSourceProject(this.projectDashboard.project, validated.modeName, randomSource);
        if (result.supported) {
            this.recordOutcomeSourceSample(result.selection.outcome.artifact, this.currentContext.projectRoot, validated.seed, validated.modeName);
        }
        this.sendJson(res, 200, result);
    }

    // Records a "Sample" draw into the shared round history exactly like every other round-producing
    // action in Studio (see StudioRoundRecorder's own doc comment) -- but unlike a Play session, there
    // is no session or wallet behind a one-shot sample draw at all: `sessionId` is a fresh id minted
    // purely as this recorded entry's own identity (so it still fits the shared StudioRuntimeSessionView
    // shape every other source uses), never a reusable session, and `credits` is genuinely omitted rather
    // than fabricated as 0 (see StudioRuntimeSessionView.credits's own doc comment). Every other field --
    // game/bet/win/screen/artifact -- is read straight off the real, already-drawn RoundArtifact, never
    // recomputed.
    private recordOutcomeSourceSample(artifact: RoundArtifact, projectRoot: string, seed: string | undefined, modeName: string): void {
        const view: StudioRuntimeSessionView = {
            sessionId: crypto.randomUUID(),
            game: artifact.provenance.game,
            bet: artifact.stake,
            win: artifact.totalWin,
            screen: artifact.screen.map((row) => [...row]),
            debug: {artifact: new PokieJsonRoundArtifactProjector().project(artifact)},
        };
        this.roundRecorder.record(view, {source: "outcome-source-sample", operation: "outcome-source-sample", projectRoot, seed, modeName});
    }

    // StudioReplayExecutionService's own onCompleted hook (see its constructor) -- fires for every
    // completed replay job, but only ever records one when `record.simulationId` is set, i.e. this
    // reproduction genuinely originated from the Replay tab's "Recent Simulation" source (handleStartReplay
    // below only lets that field through once it's verified against a real completed simulation report for
    // this project). Every field comes straight off the real ReplayDescriptor this exact reproduction just
    // produced -- never recomputed, never fabricated for a session/game type that didn't produce one (e.g.
    // `screen`/`debug.artifact` stay absent for a non-video-slot session, same as `credits` staying absent
    // for this stateless one-shot reproduction, mirroring recordOutcomeSourceSample's own reasoning).
    private recordSimulationSampleReplay(record: StudioReplayJobRecord): void {
        if (record.simulationId === undefined || record.descriptor === undefined) {
            return;
        }
        const {descriptor} = record;
        const view: StudioRuntimeSessionView = {
            sessionId: descriptor.sessionId,
            game: descriptor.game,
            bet: descriptor.totalBet,
            win: descriptor.totalWin,
            ...(descriptor.screen !== null ? {screen: descriptor.screen} : {}),
            ...(descriptor.artifact !== undefined ? {debug: {artifact: descriptor.artifact}} : {}),
        };
        this.roundRecorder.record(view, {
            source: "simulation-sample",
            operation: "simulation-sample",
            projectRoot: record.projectRoot,
            seed: record.seed,
            modeName: record.modeName,
        });
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

    private async handleValidateStakeEngineExport(req: IncomingMessage, res: ServerResponse): Promise<void> {
        if (this.currentContext.mode !== "project") {
            this.sendJson(res, 409, {error: "No active project."});
            return;
        }

        const body = await this.readJsonBody(req);
        let validated;
        try {
            validated = validateStakeEngineExportValidateRequest((body ?? {}) as StakeEngineExportValidateRequestInput);
        } catch (error) {
            this.sendJson(res, 400, {error: error instanceof Error ? error.message : String(error)});
            return;
        }

        this.sendJson(res, 200, await this.stakeEngineExportService.validate(this.currentContext.projectRoot, validated.modes));
    }

    // A well-formed request that fails at the domain level (an unreadable/malformed library, a
    // pre-existing outDir needing confirmation) still gets its own precise status here — see
    // statusForStakeEngineExport — same convention as handleBlueprintSave/handleBlueprintParExport.
    private async handleExportStakeEngine(req: IncomingMessage, res: ServerResponse): Promise<void> {
        if (this.currentContext.mode !== "project") {
            this.sendJson(res, 409, {error: "No active project."});
            return;
        }

        const body = await this.readJsonBody(req);
        let validated;
        try {
            validated = validateStakeEngineExportRequest((body ?? {}) as StakeEngineExportRequestInput);
        } catch (error) {
            this.sendJson(res, 400, {error: error instanceof Error ? error.message : String(error)});
            return;
        }

        const result = await this.stakeEngineExportService.export(this.currentContext.projectRoot, validated.modes, validated.outDir, validated.overwrite);
        this.sendJson(res, this.statusForStakeEngineExport(result.status), result);
    }

    private statusForStakeEngineExport(status: "ok" | "conflict" | "invalid" | "load-error"): number {
        if (status === "ok") {
            return 201;
        }
        return status === "conflict" ? 409 : 200;
    }

    // GET /api/project/artifacts/targets -- see StudioArtifactBuildService.listTargets's own doc comment.
    private async handleListArtifactTargets(res: ServerResponse): Promise<void> {
        if (this.currentContext.mode !== "project") {
            this.sendJson(res, 409, {error: "No active project."});
            return;
        }

        this.sendJson(res, 200, await this.artifactBuildService.listTargets(this.currentContext.projectRoot));
    }

    // POST /api/project/artifacts/preview -- the pre-build counterpart to POST /api/project/artifacts/build
    // (see StudioArtifactBuildService.preview's own doc comment): same request shape, same 400/409 status
    // conventions as the build route below, but never writes anything -- a "conflict" here is the exact same
    // ArtifactBuildConflictError a subsequent build would hit, reported before the user ever clicks Build.
    private async handlePreviewArtifact(req: IncomingMessage, res: ServerResponse): Promise<void> {
        if (this.currentContext.mode !== "project") {
            this.sendJson(res, 409, {error: "No active project."});
            return;
        }

        const body = await this.readJsonBody(req);
        let validated;
        try {
            validated = validateArtifactBuildRequest((body ?? {}) as ArtifactBuildRequestInput);
        } catch (error) {
            this.sendJson(res, 400, {error: error instanceof Error ? error.message : String(error)});
            return;
        }

        const result = await this.artifactBuildService.preview(this.currentContext.projectRoot, validated.target, validated.outDir);
        this.sendJson(res, this.statusForArtifactPreview(result.status), result);
    }

    // Unlike statusForArtifactBuild below, "ok" here is always 200 -- a preview never creates anything, so
    // there is no "201 Created" to report; a "conflict" is still 409, the same real conflict a subsequent
    // build would hit.
    private statusForArtifactPreview(status: "ok" | "unsupported" | "conflict" | "error"): number {
        return status === "conflict" ? 409 : 200;
    }

    // POST /api/project/artifacts/build -- statusForArtifactBuild below mirrors statusForParSheetExport's
    // own convention (a new artifact is 201, a conflict is 409, everything else -- unsupported/error -- is
    // a normal 200 parsed result, not a thrown error).
    private async handleBuildArtifact(req: IncomingMessage, res: ServerResponse): Promise<void> {
        if (this.currentContext.mode !== "project") {
            this.sendJson(res, 409, {error: "No active project."});
            return;
        }

        const body = await this.readJsonBody(req);
        let validated;
        try {
            validated = validateArtifactBuildRequest((body ?? {}) as ArtifactBuildRequestInput);
        } catch (error) {
            this.sendJson(res, 400, {error: error instanceof Error ? error.message : String(error)});
            return;
        }

        const result = await this.artifactBuildService.build(this.currentContext.projectRoot, validated.target, validated.outDir);
        this.sendJson(res, this.statusForArtifactBuild(result.status), result);
    }

    private statusForArtifactBuild(status: "ok" | "unsupported" | "conflict" | "error"): number {
        if (status === "ok") {
            return 201;
        }
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

        const outcomeSourceProject = this.projectDashboard?.status === "outcome-source" ? this.projectDashboard.project : undefined;
        const result = this.simulationService.start(this.currentContext.projectRoot, validated, outcomeSourceProject);
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
        if (this.currentContext.mode !== "project") {
            this.sendJson(res, 409, {error: "No active project."});
            return;
        }
        const job = this.simulationService.getStatusForProject(this.currentContext.projectRoot, id);
        if (!job) {
            this.sendJson(res, 404, {error: `Unknown simulation id "${id}".`});
            return;
        }
        this.sendJson(res, 200, job);
    }

    private handleCancelSimulation(res: ServerResponse, id: string): void {
        if (this.currentContext.mode !== "project") {
            this.sendJson(res, 409, {error: "No active project."});
            return;
        }
        const job = this.simulationService.cancelForProject(this.currentContext.projectRoot, id);
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

        // A `simulationId` claims this reproduction is a genuine "Recent Simulation" sample (see
        // recordSimulationSampleReplay) -- verified against a real, completed simulation report for this
        // project before it's ever let through, so a bogus/stale/other-project id can never fabricate
        // provenance for a round that's about to be recorded into the shared history as one.
        if (validated.simulationId !== undefined) {
            const simulationResult = this.simulationService.getReport(this.currentContext.projectRoot, validated.simulationId);
            if (simulationResult.status !== "ok") {
                this.sendJson(res, 400, {error: `Unknown or incomplete simulation "${validated.simulationId}" to sample from.`});
                return;
            }
        }

        const outcomeSourceProject = this.projectDashboard?.status === "outcome-source" ? this.projectDashboard.project : undefined;
        const result = this.replayService.start(this.currentContext.projectRoot, validated, outcomeSourceProject);
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

    // Replay & Debug's "Session Spin" find method -- an empty list (nothing played yet, or the project
    // was since switched) is still a valid 200, same as StudioSimulationService.listReports()/
    // StudioReplayExecutionService.listJobs() returning [] rather than erroring for "nothing yet".
    private handleListRecentSpins(res: ServerResponse): void {
        if (this.currentContext.mode !== "project") {
            this.sendJson(res, 409, {error: "No active project."});
            return;
        }
        this.sendJson(res, 200, this.roundRecorder.list());
    }

    // The Play tab's own two handlers -- POST /api/project/play/session (new/reset), POST
    // /api/project/play/sessions/:id/spin -- Studio's own API, never any part of PokieDevServer's own
    // HTTP contract (see StudioPlayService's own doc comment). Same "No active project." 409 guard as
    // every other /api/project/* route; StudioPlayService never throws, so nothing here ever sees a
    // SessionRepository/WalletPort/raw session object either, only the same StudioRuntimeSessionView
    // shape it already renders through.
    private async handlePlayNewSession(req: IncomingMessage, res: ServerResponse): Promise<void> {
        if (this.currentContext.mode !== "project") {
            this.sendJson(res, 409, {error: "No active project."});
            return;
        }

        const body = await this.readJsonBody(req);
        let validated;
        try {
            validated = validatePlaySessionRequest((body ?? {}) as PlaySessionRequestInput);
        } catch (error) {
            this.sendJson(res, 400, {error: error instanceof Error ? error.message : String(error)});
            return;
        }

        const result = await this.playService.newSession(this.currentContext.projectRoot, validated.seed, validated.modeName);
        if (result.status === "ok") {
            this.sendJson(res, 201, {status: "ok", session: result.session});
            return;
        }
        this.sendJson(res, 200, {status: "failed", error: result.error});
    }

    private async handlePlaySpin(res: ServerResponse, sessionId: string): Promise<void> {
        if (this.currentContext.mode !== "project") {
            this.sendJson(res, 409, {error: "No active project."});
            return;
        }

        const result = await this.playService.spin(sessionId);
        if (result.status === "ok") {
            this.sendJson(res, 200, {status: "ok", session: result.session});
            return;
        }
        this.sendPlayErrorResult(res, sessionId, result);
    }

    // PlayTab's "Find any win" scenario control -- POST /api/project/play/sessions/:id/find-any-win, no
    // body. Same response shape/error handling as handlePlaySpin above (StudioPlayService.findAnyWin()
    // returns the exact same StudioPlaySpinResult spin() does -- see its own doc comment), just repeating
    // real spins server-side instead of stopping after exactly one.
    private async handlePlayFindAnyWin(res: ServerResponse, sessionId: string): Promise<void> {
        if (this.currentContext.mode !== "project") {
            this.sendJson(res, 409, {error: "No active project."});
            return;
        }

        const result = await this.playService.findAnyWin(sessionId);
        if (result.status === "ok") {
            this.sendJson(res, 200, {status: "ok", session: result.session});
            return;
        }
        this.sendPlayErrorResult(res, sessionId, result);
    }

    // PlayTab's "Find symbol win" scenario control -- POST /api/project/play/sessions/:id/find-symbol-win,
    // body `{symbolId}` -- the chooser's own currently-selected symbol, propagated straight through to
    // StudioPlayService.findSymbolWin() (see its own doc comment). Same response shape as
    // handlePlayFindAnyWin above otherwise.
    private async handlePlayFindSymbolWin(req: IncomingMessage, res: ServerResponse, sessionId: string): Promise<void> {
        if (this.currentContext.mode !== "project") {
            this.sendJson(res, 409, {error: "No active project."});
            return;
        }

        const body = await this.readJsonBody(req);
        let validated;
        try {
            validated = validatePlayFindSymbolWinRequest((body ?? {}) as PlayFindSymbolWinRequestInput);
        } catch (error) {
            this.sendJson(res, 400, {error: error instanceof Error ? error.message : String(error)});
            return;
        }

        const result = await this.playService.findSymbolWin(sessionId, validated.symbolId);
        if (result.status === "ok") {
            this.sendJson(res, 200, {status: "ok", session: result.session});
            return;
        }
        this.sendPlayErrorResult(res, sessionId, result);
    }

    // PlayTab's "Find free games" scenario control -- POST /api/project/play/sessions/:id/find-free-games,
    // no body. Same response shape/error handling as handlePlayFindAnyWin above
    // (StudioPlayService.findFreeGames() returns the exact same StudioPlaySpinResult spin() does -- see
    // its own doc comment), just repeating real spins server-side until one actually triggers free games.
    private async handlePlayFindFreeGames(res: ServerResponse, sessionId: string): Promise<void> {
        if (this.currentContext.mode !== "project") {
            this.sendJson(res, 409, {error: "No active project."});
            return;
        }

        const result = await this.playService.findFreeGames(sessionId);
        if (result.status === "ok") {
            this.sendJson(res, 200, {status: "ok", session: result.session});
            return;
        }
        this.sendPlayErrorResult(res, sessionId, result);
    }

    // "not-found"/"blocked" are bare `{"error"}` bodies; "error" covers anything else (safe message
    // only, never a stack trace) -- never "not-running"/"conflict", neither of which StudioPlaySpinResult
    // can ever report (there is no server to not be running, and no expectedVersion/shared store to
    // conflict over -- see StudioPlayService.spin()'s own doc comment).
    private sendPlayErrorResult(res: ServerResponse, sessionId: string, result: Exclude<StudioPlaySpinResult, {status: "ok"}>): void {
        if (result.status === "not-found") {
            this.sendJson(res, 404, {error: `Unknown sessionId "${sessionId}".`});
            return;
        }
        if (result.status === "blocked") {
            this.sendJson(res, 400, {error: result.error});
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

// A parsed blueprint's own "manifest" object, or undefined when the blueprint isn't at least shaped
// enough to have one -- shared by inspectBlueprintProject/validateBlueprintProject above so neither
// re-derives the same "is this a plain object with a plain-object manifest" check for itself.
function readBlueprintManifestFields(blueprint: unknown): Record<string, unknown> | undefined {
    if (typeof blueprint !== "object" || blueprint === null) {
        return undefined;
    }
    const manifest = (blueprint as Record<string, unknown>).manifest;
    return typeof manifest === "object" && manifest !== null ? (manifest as Record<string, unknown>) : undefined;
}

function readBlueprintManifest(blueprint: unknown): {name?: string; version?: string; description?: string} {
    const manifest = readBlueprintManifestFields(blueprint);
    return {
        name: typeof manifest?.name === "string" ? manifest.name : undefined,
        version: typeof manifest?.version === "string" ? manifest.version : undefined,
        description: typeof manifest?.description === "string" ? manifest.description : undefined,
    };
}

// null (rather than a partially-filled object) unless every one of id/name/version is a real string --
// mirrors PokieGamePackageValidator's own extractGame(), whose "game" field is likewise all-or-nothing.
function readBlueprintGameIdentity(blueprint: unknown): {id: string; name: string; version: string} | null {
    const manifest = readBlueprintManifestFields(blueprint);
    if (typeof manifest?.id !== "string" || typeof manifest?.name !== "string" || typeof manifest?.version !== "string") {
        return null;
    }
    return {id: manifest.id, name: manifest.name, version: manifest.version};
}
