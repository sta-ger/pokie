import {loadPokieGame} from "pokie";
import fs from "fs";
import path from "path";
import {passthroughRuntimePackageResolver, RuntimePackageResolving} from "../../materialize/materializeRuntimePackage.js";
import {loadProjectDashboardContext, type ProjectDashboardLoadOptions, type ProjectLocationDescribing} from "../loadProjectDashboardContext.js";
import type {ProjectDashboardContext} from "../ProjectDashboardContext.js";
import {InMemoryRecentProjectsRepository} from "../InMemoryRecentProjectsRepository.js";
import type {RecentProjectsRepository} from "../RecentProjectsRepository.js";
import {IndependentProjectDirectoryResult, PokiePathResolver} from "../../paths/PokiePathResolver.js";
import type {StudioDefaultLocationView} from "./StudioDefaultLocationView.js";
import type {StudioHomeRecentProjectView} from "./StudioHomeRecentProjectView.js";

// A Home open is owned by StudioServer's runtime-preparation generation.  The service accepts the
// owner's predicate as well as its AbortSignal because remembering a project is an observable
// commit, not preparatory work that can safely race a newer Home intent.
export type StudioHomeOpenProjectOptions = ProjectDashboardLoadOptions & {readonly recordRecentProject?: boolean};

// Drives loadPokieGame -- the exact same project-loading path every migrated CLI command already uses
// -- directly. No CLI command is ever spawned as a subprocess, and none of their logic is
// reimplemented; this only adds the plain-data DTO conversions (never a stack trace) and the
// recent-projects bookkeeping every successful flow shares. Mirrors StudioSimulationService/
// StudioReplayExecutionService's own "pokieVersion first, everything else an overridable collaborator"
// constructor shape. Scaffolding a hand-coded game and building directly from a blueprint file used to
// live here too, behind Home's now-removed "Advanced Tools" tab -- see cli/commands/InitCommand.ts/
// CreateCommand.ts for the CLI's own replacements ("pokie init"/"pokie create").
export class StudioHomeService {
    private readonly pokieVersion: string;
    private readonly recentProjectsRepository: RecentProjectsRepository;
    private readonly loadGame: typeof loadPokieGame;
    private readonly pathResolver: PokiePathResolver;
    // Crosses from "the projectRoot POST /api/home/projects/open was given" to "a real, loadable
    // runtime" before openProject()'s own loadProjectDashboardContext call ever touches loadGame — same
    // materializing boundary StudioServer's own resolveRuntimePackageRoot field crosses for a direct
    // `pokie <path>` launch (see that class's field doc comment). Defaults to a no-op passthrough so
    // every existing caller/test keeps behaving exactly as before this boundary existed; StudioCommand
    // wires the real, materializing one in.
    private readonly resolveRuntimePackageRoot: RuntimePackageResolving;
    // Answers "what is this project itself" (type/capabilities/origin) for openProject()'s own
    // loadProjectDashboardContext call -- see that function's own doc comment. Defaults to "nothing
    // known" so every existing caller/test keeps behaving exactly as before those fields existed;
    // StudioCommand wires in the real StudioProjectRegistrationService.describeLocation.
    private readonly describeLocation: ProjectLocationDescribing;

    constructor(
        pokieVersion: string,
        recentProjectsRepository: RecentProjectsRepository = new InMemoryRecentProjectsRepository(),
        loadGame: typeof loadPokieGame = loadPokieGame,
        pathResolver: PokiePathResolver = new PokiePathResolver(),
        resolveRuntimePackageRoot: RuntimePackageResolving = passthroughRuntimePackageResolver,
        describeLocation: ProjectLocationDescribing = () => Promise.resolve(undefined),
    ) {
        this.pokieVersion = pokieVersion;
        this.recentProjectsRepository = recentProjectsRepository;
        this.loadGame = loadGame;
        this.pathResolver = pathResolver;
        this.resolveRuntimePackageRoot = resolveRuntimePackageRoot;
        this.describeLocation = describeLocation;
    }

    // Backs a "suggest a default destination" affordance for any future flow that scaffolds a brand-new
    // managed project directory -- purely additive and read-only (no directory is created here). See
    // PokiePathResolver for the platform Documents/Home policy and its own unsafe-default guard.
    public resolveDefaultProjectDirectory(name: string): IndependentProjectDirectoryResult {
        return this.pathResolver.resolveIndependentProjectDirectory(name);
    }

    // Backs GET /api/home/fs/default-location -- the "platform Documents, then Home" rung of every
    // PathInput's start-location precedence (see resolveBrowseStartLocation.ts on the client). `name`
    // is optional: when given, this reuses resolveDefaultProjectDirectory's POKIE/<name> policy;
    // when omitted (browsing to an *existing* location rather than a brand-new project's destination),
    // it falls back to the bare Documents/Home directory with no project-name suffix.
    public resolveDefaultBrowseLocation(name?: string): StudioDefaultLocationView {
        const trimmedName = name?.trim();
        if (trimmedName && trimmedName.length > 0) {
            const result = this.pathResolver.resolveIndependentProjectDirectory(trimmedName);
            return result.status === "valid" ? {status: "valid", directory: result.directory, source: result.source} : {status: "unavailable"};
        }
        const base = this.pathResolver.resolveBaseDirectory();
        return base.status === "valid" ? {status: "valid", directory: base.directory, source: base.source} : {status: "unavailable"};
    }

    // A project is flagged "missing" (never silently dropped — see StudioHomeRecentProjectView's own
    // doc comment) once its directory or package.json can no longer be found on disk.
    public async listRecentProjects(): Promise<StudioHomeRecentProjectView[]> {
        const entries = await this.recentProjectsRepository.list();
        return entries.map((entry) => ({...entry, missing: !this.projectStillExists(entry.projectRoot)}));
    }

    // Reuses loadProjectDashboardContext exactly as the Project Dashboard's own background load and
    // the (now-removed) single-shot Open Project flow both already did — "does this path actually
    // load" is decided in exactly one place. StudioServer itself performs the actual Studio context
    // transition on a "loaded" result; this only loads and records it as a recent project.
    public async openProject(projectRoot: string, options: StudioHomeOpenProjectOptions = {}): Promise<ProjectDashboardContext> {
        const dashboard = await loadProjectDashboardContext(projectRoot, this.loadGame, this.resolveRuntimePackageRoot, this.describeLocation, undefined, undefined, options);
        this.assertOpenProjectCurrent(options);
        if (options.recordRecentProject !== false && dashboard.status === "loaded") {
            await this.rememberRecentProject(dashboard.projectRoot, dashboard.game.name);
            this.assertOpenProjectCurrent(options);
        } else if (options.recordRecentProject !== false && (dashboard.status === "outcome-source" || dashboard.status === "artifact")) {
            // Neither an outcome source nor an exchange-only artifact carries a PokieGameManifest to name itself
            // with (see ProjectDashboardContext's own doc comment) -- the resolved project's own
            // directory/file name is the only stable identity available here, same fallback Overview
            // already uses for an unresolved name elsewhere.
            await this.rememberRecentProject(dashboard.projectRoot, path.basename(dashboard.projectRoot));
            this.assertOpenProjectCurrent(options);
        }
        return dashboard;
    }

    // Public so StudioBlueprintService (see cli/studio/blueprint/StudioBlueprintService.ts) can record a
    // successful blueprint-editor build here too, rather than needing a second, divergent
    // RecentProjectsRepository instance — this stays the one place recent-projects bookkeeping happens.
    public async rememberRecentProject(projectRoot: string, name: string): Promise<void> {
        await this.recentProjectsRepository.add({projectRoot, name, openedAt: new Date().toISOString()});
    }

    private assertOpenProjectCurrent(options: StudioHomeOpenProjectOptions): void {
        if (options.signal?.aborted || options.isCurrent?.() === false) {
            throw new Error("Runtime preparation was cancelled before a runnable game was available.");
        }
    }

    private projectStillExists(projectRoot: string): boolean {
        return fs.existsSync(projectRoot) && fs.existsSync(path.join(projectRoot, "package.json"));
    }
}
