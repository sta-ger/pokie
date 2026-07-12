import {
    buildGameBuildInfo,
    GameBlueprint,
    GameBlueprintValidating,
    GameBlueprintValidator,
    GamePackageGenerating,
    GamePackageGenerator,
    loadGameBlueprint,
    loadPokieGame,
    ValidationIssue,
} from "pokie";
import fs from "fs";
import path from "path";
import {loadProjectDashboardContext} from "../loadProjectDashboardContext.js";
import type {ProjectDashboardContext} from "../ProjectDashboardContext.js";
import {InMemoryRecentProjectsRepository} from "../InMemoryRecentProjectsRepository.js";
import type {RecentProjectsRepository} from "../RecentProjectsRepository.js";
import {GamePackageCreating} from "../../scaffold/GamePackageCreating.js";
import {GamePackageCreator} from "../../scaffold/GamePackageCreator.js";
import {GamePackageScaffolder} from "../../scaffold/GamePackageScaffolder.js";
import {GamePackageScaffolding} from "../../scaffold/GamePackageScaffolding.js";
import type {ScaffoldResult} from "../../scaffold/ScaffoldResult.js";
import type {StudioBuildPreviewView} from "./StudioBuildPreviewView.js";
import type {StudioBuildResult} from "./StudioBuildResult.js";
import type {StudioHomeRecentProjectView} from "./StudioHomeRecentProjectView.js";
import type {StudioScaffoldResultView} from "./StudioScaffoldResultView.js";
import type {ValidatedBuildRequest} from "./validateBuildRequest.js";
import type {ValidatedCreateProjectRequest} from "./validateCreateProjectRequest.js";
import type {ValidatedInitProjectRequest} from "./validateInitProjectRequest.js";

// Drives GamePackageCreating/GamePackageScaffolding/loadGameBlueprint/GameBlueprintValidating/
// GamePackageGenerating/loadPokieGame — the exact same services `pokie create`/`pokie init`/
// `pokie build`/every project-loading path already use — directly. No CLI command is ever spawned as a
// subprocess, and none of their logic is reimplemented; this only adds the plain-data DTO conversions
// (never a stack trace) and the recent-projects bookkeeping every successful flow shares. Mirrors
// StudioSimulationService/StudioReplayExecutionService's own "pokieVersion first, everything else an
// overridable collaborator" constructor shape.
export class StudioHomeService {
    private readonly pokieVersion: string;
    private readonly recentProjectsRepository: RecentProjectsRepository;
    private readonly gamePackageCreator: GamePackageCreating;
    private readonly gamePackageScaffolder: GamePackageScaffolding;
    private readonly loadBlueprint: (filePath: string) => unknown;
    private readonly blueprintValidator: GameBlueprintValidating;
    private readonly gamePackageGenerator: GamePackageGenerating;
    private readonly loadGame: typeof loadPokieGame;

    constructor(
        pokieVersion: string,
        recentProjectsRepository: RecentProjectsRepository = new InMemoryRecentProjectsRepository(),
        gamePackageCreator: GamePackageCreating = new GamePackageCreator(pokieVersion),
        gamePackageScaffolder: GamePackageScaffolding = new GamePackageScaffolder(pokieVersion),
        loadBlueprint: (filePath: string) => unknown = loadGameBlueprint,
        blueprintValidator: GameBlueprintValidating = new GameBlueprintValidator(),
        gamePackageGenerator: GamePackageGenerating = new GamePackageGenerator(pokieVersion),
        loadGame: typeof loadPokieGame = loadPokieGame,
    ) {
        this.pokieVersion = pokieVersion;
        this.recentProjectsRepository = recentProjectsRepository;
        this.gamePackageCreator = gamePackageCreator;
        this.gamePackageScaffolder = gamePackageScaffolder;
        this.loadBlueprint = loadBlueprint;
        this.blueprintValidator = blueprintValidator;
        this.gamePackageGenerator = gamePackageGenerator;
        this.loadGame = loadGame;
    }

    // A project is flagged "missing" (never silently dropped — see StudioHomeRecentProjectView's own
    // doc comment) once its directory or package.json can no longer be found on disk.
    public async listRecentProjects(): Promise<StudioHomeRecentProjectView[]> {
        const entries = await this.recentProjectsRepository.list();
        return entries.map((entry) => ({...entry, missing: !this.projectStillExists(entry.projectRoot)}));
    }

    public async createProject(request: ValidatedCreateProjectRequest): Promise<StudioScaffoldResultView> {
        const destinationDir = path.resolve(request.destinationDir);
        let result: ScaffoldResult;
        try {
            result = this.gamePackageCreator.create(destinationDir, request.name, {
                id: request.gameId,
                name: request.gameName,
                version: request.version,
            });
        } catch (error) {
            return {status: "error", error: error instanceof Error ? error.message : String(error)};
        }
        await this.rememberRecentProject(result.projectRoot, result.manifest.name);
        return {status: "ok", ...result};
    }

    public async initProject(request: ValidatedInitProjectRequest): Promise<StudioScaffoldResultView> {
        const directory = path.resolve(request.directory);
        let result: ScaffoldResult;
        try {
            result = this.gamePackageScaffolder.scaffold(directory);
        } catch (error) {
            return {status: "error", error: error instanceof Error ? error.message : String(error)};
        }
        await this.rememberRecentProject(result.projectRoot, result.manifest.name);
        return {status: "ok", ...result};
    }

    // Never writes anything — see StudioBuildPreviewView's own doc comment.
    public previewBuild(request: ValidatedBuildRequest): StudioBuildPreviewView {
        const loaded = this.loadAndValidateBlueprint(request.blueprintPath);
        if (loaded.status !== "ready") {
            return loaded;
        }
        const {blueprint, warnings} = loaded;
        const buildInfo = buildGameBuildInfo(blueprint, this.pokieVersion, request.blueprintPath);
        return {
            status: "ok",
            warnings,
            manifest: blueprint.manifest,
            reels: blueprint.reels,
            rows: blueprint.rows,
            symbolsCount: blueprint.symbols.length,
            blueprintHash: buildInfo.blueprintHash,
            expectedFiles: buildInfo.files ?? [],
        };
    }

    public async buildProject(request: ValidatedBuildRequest): Promise<StudioBuildResult> {
        const loaded = this.loadAndValidateBlueprint(request.blueprintPath);
        if (loaded.status !== "ready") {
            return loaded;
        }
        const {blueprint, warnings} = loaded;

        let generated;
        try {
            generated = this.gamePackageGenerator.generate(blueprint, process.cwd(), request.outDir, request.blueprintPath);
        } catch (error) {
            return {status: "error", error: error instanceof Error ? error.message : String(error)};
        }

        await this.rememberRecentProject(generated.projectRoot, generated.manifest.name);
        return {
            status: "ok",
            projectRoot: generated.projectRoot,
            manifest: generated.manifest,
            createdFiles: generated.createdFiles,
            buildInfo: generated.buildInfo,
            unchanged: generated.unchanged,
            warnings,
        };
    }

    // Reuses loadProjectDashboardContext exactly as the Project Dashboard's own background load and
    // the (now-removed) single-shot Open Project flow both already did — "does this path actually
    // load" is decided in exactly one place. StudioServer itself performs the actual Studio context
    // transition on a "loaded" result; this only loads and records it as a recent project.
    public async openProject(projectRoot: string): Promise<ProjectDashboardContext> {
        const dashboard = await loadProjectDashboardContext(projectRoot, this.loadGame);
        if (dashboard.status === "loaded") {
            await this.rememberRecentProject(dashboard.projectRoot, dashboard.game.name);
        }
        return dashboard;
    }

    // "ready" (rather than "ok") is deliberate: this return type's "load-error"/"invalid" variants are
    // structurally identical to StudioBuildPreviewView/StudioBuildResult's own, so callers can return
    // this value as-is on failure — but reusing "ok" here too would leave two differently-shaped
    // "ok" variants in the union, defeating status-based narrowing at the call sites.
    private loadAndValidateBlueprint(
        blueprintPath: string,
    ): {status: "ready"; blueprint: GameBlueprint; warnings: ValidationIssue[]} | {status: "load-error"; error: string} | {status: "invalid"; errors: ValidationIssue[]; warnings: ValidationIssue[]} {
        let blueprint: unknown;
        try {
            blueprint = this.loadBlueprint(blueprintPath);
        } catch (error) {
            return {status: "load-error", error: error instanceof Error ? error.message : String(error)};
        }

        const issues = this.blueprintValidator.validate(blueprint);
        const errors = issues.filter((issue) => issue.severity === "error");
        const warnings = issues.filter((issue) => issue.severity !== "error");
        if (errors.length > 0) {
            return {status: "invalid", errors, warnings};
        }

        return {status: "ready", blueprint: blueprint as GameBlueprint, warnings};
    }

    private async rememberRecentProject(projectRoot: string, name: string): Promise<void> {
        await this.recentProjectsRepository.add({projectRoot, name, openedAt: new Date().toISOString()});
    }

    private projectStillExists(projectRoot: string): boolean {
        return fs.existsSync(projectRoot) && fs.existsSync(path.join(projectRoot, "package.json"));
    }
}
