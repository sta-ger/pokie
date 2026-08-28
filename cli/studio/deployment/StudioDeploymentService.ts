import {
    createLocalJsonExternalDeploymentTarget,
    ExternalDeploymentModeInput,
    ExternalDeploymentService,
    ExternalDeploymentServicing,
    ExternalDeploymentTarget,
    ExternalDeploymentTargetRegistry,
    OutcomeLibraryBundleReader,
    OutcomeLibraryBundleReading,
    StakeEngineImporter,
    StakeEngineImporting,
    describeArtifactConversionPlanDiagnostic,
} from "pokie";
import fs from "fs";
import path from "path";
import type {OutcomeLibrarySelector} from "../outcomeLibrary/OutcomeLibrarySelector.js";
import {loadOutcomeLibraryFromSelector} from "../outcomeLibrary/loadOutcomeLibraryFromSelector.js";
import {resolveCurrentBuildModeIds} from "./resolveCurrentBuildModeIds.js";
import type {StudioDeploymentBuildModesView} from "./StudioDeploymentBuildModesView.js";
import type {StudioDeploymentRunView} from "./StudioDeploymentRunView.js";
import type {StudioDeploymentTargetSummary} from "./StudioDeploymentTargetSummary.js";
import {toStudioDeploymentRunView} from "./toStudioDeploymentRunView.js";
import type {ValidatedDeploymentRunRequest} from "./validateDeploymentRunRequest.js";
import type {StudioDeploymentModeInput} from "./StudioDeploymentModeInput.js";
import {StudioArtifactConversionPlanning, StudioArtifactConversionPlanningService} from "../artifacts/StudioArtifactConversionPlanningService.js";
import {describePreparedArtifactPlanDrift} from "../artifacts/describePreparedArtifactPlanDrift.js";
import {createExternalOutcomeLibraryPlan} from "../artifacts/createExternalArtifactConversionPlan.js";

const DEPLOYMENT_OUTPUT_DIRNAME = "deployment";
// Direct embedding remains supported, but it must plan with the running POKIE
// package version rather than the old synthetic 0.0.0 provenance. StudioServer
// always supplies its configured version through withPokieVersion(); npm sets
// this value for direct package consumers during normal installation/testing.
const DEFAULT_DIRECT_POKIE_VERSION = process.env.npm_package_version ?? "1.3.0";
const NO_SERVER_SELECTED_MODES: StudioDeploymentModeResolving = () => Promise.resolve([]);

export type StudioDeploymentRunResult =
    | {readonly status: "ok"; readonly view: StudioDeploymentRunView}
    | {readonly status: "target-not-found"; readonly plan: import("pokie").ArtifactConversionPlan}
    | {readonly status: "invalid-modes"; readonly error: string; readonly plan: import("pokie").ArtifactConversionPlan}
    | {readonly status: "load-error"; readonly error: string; readonly plan: import("pokie").ArtifactConversionPlan};

/** Resolves the current project's verified deployment inputs on the server. */
export type StudioDeploymentModeResolving = (projectRoot: string) => Promise<readonly StudioDeploymentModeInput[]>;

// Domain-language remediation for a request naming a mode absent/stale from the current build (see
// resolveCurrentBuildModeIds's own doc comment) -- never the raw "modeName" schema path, always which
// mode(s) were rejected and which ones are actually pickable right now, the same "current build only"
// contract the Configure step's own describeBuildModesUnavailable/remainingDeploymentModeChoices already
// enforce client-side (see cli/studio-client/src/domain/interpret/Deployment.ts).
function describeInvalidDeploymentModes(staleModeNames: readonly string[], buildModeIds: readonly string[]): string {
    const staleList = staleModeNames.map((name) => `mode "${name}"`).join(", ");
    const verb = staleModeNames.length === 1 ? "isn't" : "aren't";
    return `${staleList} ${verb} part of this project's current build -- rebuild the project, then pick from: ${buildModeIds.join(", ")}.`;
}

// Domain-language remediation for a request made against a project with no inspectable current build
// (see resolveCurrentBuildModeIds's own doc comment) -- there is nothing real to check a requested mode
// against, so nothing can be proven safe to deploy; this is a rejection, never a "nothing to check,
// skip the check" pass-through.
function describeBuildModesUnavailableForDeployment(): string {
    return 'This project has no current build to deploy against -- run "pokie build" (or the Certification tab\'s own build step), then try again.';
}

// A bundle/Stake Engine selector carries its own "modeName" (which mode of the bundle/export to read --
// see OutcomeLibrarySelector); a "json" selector has no such field. Mismatched against the deployment
// row's own mode would silently deploy one mode's data under another mode's name, so this is checked --
// and rejected -- before any selector is ever resolved to a real library.
function selectorModeName(selector: OutcomeLibrarySelector): string | undefined {
    return selector.kind === "json" ? undefined : selector.modeName;
}

function describeSelectorModeMismatch(modeName: string, selectorModeName: string): string {
    return (
        `mode "${modeName}"'s library selector names mode "${selectorModeName}" -- a bundle/Stake Engine ` +
        "selector must name the exact same mode as its own deployment row."
    );
}

// The Project Dashboard's Deployment tab, built directly on top of the pokie package's own External
// Adapter SDK (see docs/external-adapter-sdk.md) — this class never projects a RoundArtifact, never
// generates artifacts, and never validates a compatibility/artifact-shape concern itself; every one of
// those already-solved problems is delegated straight to ExternalDeploymentService.deploy(), the SDK's
// own single orchestrator. What this class actually owns is Studio-specific plumbing only: which
// target(s) are available for the active project (a registry seeded with exactly the SDK's own
// local-filesystem example target — see docs/cli.md's own "no private RGS integration" note, which
// applies here too), turning a validated HTTP request into the SDK's own input shapes, and rejecting a
// mode absent from the active project's own current build (see resolveCurrentBuildModeIds) before any of
// that — a check the Configure UI already makes unreachable through normal use, but which still has to
// hold for a request that skips the UI entirely (see run()'s own doc comment).
//
// "Preview" vs "Deploy" is not two different pipelines — it's the exact same deploy() call against two
// different target objects: publish:false strips `runtimeAdapter` (so ExternalDeploymentService's own
// existing "only calls runtimeAdapter.deliver() when the target declares one" behavior means nothing
// is ever written to disk), publish:true keeps it. See run()'s own doc comment.
export class StudioDeploymentService {
    private readonly externalDeploymentService: ExternalDeploymentServicing;
    private readonly createLocalTarget: (outDir: string) => ExternalDeploymentTarget;
    private readonly bundleReader: OutcomeLibraryBundleReading<string>;
    private readonly stakeEngineImporter: StakeEngineImporting<string>;
    private readonly readFile: (resolvedPath: string) => string;
    private readonly realpath: (resolvedPath: string) => string;
    private readonly resolveBuildModeIds: (projectRoot: string) => Promise<readonly string[] | undefined>;
    private readonly planning: StudioArtifactConversionPlanning;
    private readonly resolveServerSelectedModes: StudioDeploymentModeResolving;

    constructor(
        externalDeploymentService: ExternalDeploymentServicing = new ExternalDeploymentService(),
        createLocalTarget: (outDir: string) => ExternalDeploymentTarget = (outDir) => createLocalJsonExternalDeploymentTarget({outDir}),
        readFile: (resolvedPath: string) => string = (resolvedPath) => fs.readFileSync(resolvedPath, "utf-8"),
        realpath: (resolvedPath: string) => string = (resolvedPath) => fs.realpathSync(resolvedPath),
        bundleReader: OutcomeLibraryBundleReading<string> = new OutcomeLibraryBundleReader<string>(),
        stakeEngineImporter: StakeEngineImporting<string> = new StakeEngineImporter<string>(),
        resolveBuildModeIds: (projectRoot: string) => Promise<readonly string[] | undefined> = resolveCurrentBuildModeIds,
        planning: StudioArtifactConversionPlanning | undefined = undefined,
        pokieVersion = DEFAULT_DIRECT_POKIE_VERSION,
        resolveServerSelectedModes: StudioDeploymentModeResolving = NO_SERVER_SELECTED_MODES,
    ) {
        this.externalDeploymentService = externalDeploymentService;
        this.createLocalTarget = createLocalTarget;
        this.readFile = readFile;
        this.realpath = realpath;
        this.bundleReader = bundleReader;
        this.stakeEngineImporter = stakeEngineImporter;
        this.resolveBuildModeIds = resolveBuildModeIds;
        this.planning = planning ?? new StudioArtifactConversionPlanningService(pokieVersion);
        this.resolveServerSelectedModes = resolveServerSelectedModes;
    }

    /** Creates the production service with Studio's configured package version. */
    public static withPokieVersion(
        pokieVersion: string,
        resolveServerSelectedModes: StudioDeploymentModeResolving = NO_SERVER_SELECTED_MODES,
    ): StudioDeploymentService {
        return new StudioDeploymentService(
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            pokieVersion,
            resolveServerSelectedModes,
        );
    }

    public listTargets(projectRoot: string): StudioDeploymentTargetSummary[] {
        return this.buildRegistry(projectRoot)
            .list()
            .map((target) => ({id: target.id, version: target.version, requirements: target.requirements, capabilities: target.capabilities}));
    }

    // The Configure step's own mode picker, backed by the exact same current-built-package resolution
    // run() itself checks a request against (see resolveCurrentBuildModeIds's own doc comment) -- so the
    // Configure UI can never offer a mode run() would go on to reject, and never drifts from it just
    // because the tracked source was edited, moved, or deleted after the last build.
    public async getBuildModes(projectRoot: string): Promise<StudioDeploymentBuildModesView> {
        const modeIds = await this.resolveBuildModeIds(projectRoot);
        return modeIds === undefined ? {status: "unavailable"} : {status: "ok", modeIds};
    }

    // Looks the requested target up in the same registry listTargets() itself builds (so "is this
    // target even registered" can never disagree between the two calls), then rejects outright (status:
    // "invalid-modes") if the active project's own current build modes aren't known at all (see
    // resolveCurrentBuildModeIds -- an ungenerated project, or one whose entry module fails to load, has
    // nothing real to check a requested mode against, so nothing can be proven safe to deploy; this is a
    // rejection, never "nothing to check, skip the check") or if any requested mode isn't one of them.
    // Also rejects any mode whose bundle/Stake Engine librarySelector names a different mode than its
    // own deployment row (see selectorModeName) -- before either check, no selector is ever resolved to
    // a real library. Only once every mode passes both checks does it resolve each mode's own
    // librarySelector (see loadOutcomeLibraryFromSelector — the same json/bundle/stakeengine resolution
    // the Outcome Libraries tab's own Select/Compare already use, so a mode can deploy straight from a
    // bundle the registry found compatible, not only a hand-typed flat JSON file; the first mode/library
    // that fails to load stops the whole request before ExternalDeploymentService is ever called, since
    // there's no well-formed input to give it yet), then runs the one real pipeline call.
    public async run(projectRoot: string, request: ValidatedDeploymentRunRequest): Promise<StudioDeploymentRunResult> {
        // Deployment owns SDK-specific delivery, but the library it deploys is a
        // planner-governed prerequisite.  Carry that exact server plan forward so
        // the browser never has to infer whether it can create/reuse one.
        // A selector-less request intentionally means "use the server's current
        // verified compatible library".  Resolve it exactly once before both
        // planning and reading, so a browser cannot choose a stale/moved bundle
        // between those two phases.
        const selectedModes = request.modes.length === 0 ? await this.resolveServerSelectedModes(projectRoot) : request.modes;
        const plan = await this.prepareForSelectedBundles(projectRoot, selectedModes);
        const registry = this.buildRegistry(projectRoot);
        const target = registry.get(request.targetId);
        if (target === undefined) {
            return {status: "target-not-found", plan};
        }

        const buildModeIds = await this.resolveBuildModeIds(projectRoot);
        if (buildModeIds === undefined) {
            return {status: "invalid-modes", error: describeBuildModesUnavailableForDeployment(), plan};
        }
        const staleModeNames = selectedModes.map((mode) => mode.modeName).filter((modeName) => !buildModeIds.includes(modeName));
        if (staleModeNames.length > 0) {
            return {status: "invalid-modes", error: describeInvalidDeploymentModes(staleModeNames, buildModeIds), plan};
        }

        const mismatchedSelectorMode = selectedModes.find((mode) => {
            const named = selectorModeName(mode.librarySelector);
            return named !== undefined && named !== mode.modeName;
        });
        if (mismatchedSelectorMode !== undefined) {
            return {
                status: "invalid-modes",
                error: describeSelectorModeMismatch(mismatchedSelectorMode.modeName, selectorModeName(mismatchedSelectorMode.librarySelector) as string),
                plan,
            };
        }

        // Request-level blockers have precedence over an unreadable selector:
        // they neither consume the selector nor erase its authoritative plan.
        // Once the request itself is valid, an unavailable selector plan is a
        // hard boundary and must not fall through to the legacy JSON reader.
        if (plan.status !== "planned") {
            return {status: "load-error", error: describeArtifactConversionPlanDiagnostic(plan) ?? plan.diagnostic?.message ?? "Outcome library deployment is unavailable.", plan};
        }
        const selectedSource = this.selectedBundleSource(projectRoot, selectedModes);
        const planDrift = selectedSource === undefined ? undefined : describePreparedArtifactPlanDrift(plan, selectedSource, "outcomeLibrary");
        if (planDrift !== undefined) {
            return {status: "load-error", error: planDrift, plan};
        }

        const modes: ExternalDeploymentModeInput[] = [];
        for (const mode of selectedModes) {
            const loaded = await loadOutcomeLibraryFromSelector(
                projectRoot,
                mode.librarySelector,
                this.bundleReader,
                this.stakeEngineImporter,
                this.readFile,
                this.realpath,
            );
            if (loaded.status === "load-error") {
                return {status: "load-error", error: `mode "${mode.modeName}": ${loaded.error}`, plan};
            }
            modes.push({modeName: mode.modeName, library: loaded.library});
        }

        // A frozen target's own fields can't be reassigned (see ExternalDeploymentTargetRegistry), but
        // spreading it into a fresh object literal is exactly how the SDK's own docs describe building
        // a "preview" variant — a brand-new, unfrozen object, never a mutation of the registered one.
        const runnableTarget = request.publish ? target : {...target, runtimeAdapter: undefined};
        const result = await this.externalDeploymentService.deploy(runnableTarget, modes);
        return {
            status: "ok",
            view: {
                ...toStudioDeploymentRunView(result, target.id, request.publish, plan),
            },
        };
    }

    private buildRegistry(projectRoot: string): ExternalDeploymentTargetRegistry {
        const registry = new ExternalDeploymentTargetRegistry();
        registry.register(this.createLocalTarget(path.join(projectRoot, DEPLOYMENT_OUTPUT_DIRNAME, "local-json-example")));
        return registry;
    }

    /** See StudioStakeEngineExportService's counterpart: a canonical selector is
     * a durable planner source, so deployment cannot preview a project-root plan
     * and then consume an unrelated selected bundle. */
    private prepareForSelectedBundles(projectRoot: string, modes: readonly ValidatedDeploymentRunRequest["modes"][number][]): Promise<import("pokie").ArtifactConversionPlan> {
        const selectedSource = this.selectedBundleSource(projectRoot, modes);
        if (selectedSource !== undefined) {
            return this.planning.prepare(selectedSource, "outcomeLibrary");
        }
        // A terminal deployment result always owns a plan for the input it
        // actually reads. A single JSON selector has its canonical location;
        // a mixed request is explicitly identified as a mixed external set,
        // never as the project root.
        return Promise.resolve(createExternalOutcomeLibraryPlan(this.selectedExternalSource(projectRoot, modes), "outcomeLibrary"));
    }

    private selectedBundleSource(projectRoot: string, modes: readonly ValidatedDeploymentRunRequest["modes"][number][]): string | undefined {
        const bundleDirs = modes.map((mode) => mode.librarySelector).filter((selector): selector is Extract<typeof selector, {kind: "bundle"}> => selector.kind === "bundle");
        const uniqueBundleDirs = Array.from(new Set(bundleDirs.map((selector) => path.resolve(projectRoot, selector.bundleDir))));
        return bundleDirs.length === modes.length && uniqueBundleDirs.length === 1 ? uniqueBundleDirs[0] : undefined;
    }

    private selectedExternalSource(projectRoot: string, modes: readonly ValidatedDeploymentRunRequest["modes"][number][]): string | undefined {
        const jsonPaths = modes.map((mode) => mode.librarySelector).filter((selector): selector is Extract<OutcomeLibrarySelector, {kind: "json"}> => selector.kind === "json");
        const uniquePaths = Array.from(new Set(jsonPaths.map((selector) => path.resolve(projectRoot, selector.path))));
        return jsonPaths.length === modes.length && uniquePaths.length === 1 ? uniquePaths[0] : undefined;
    }
}
