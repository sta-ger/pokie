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
} from "pokie";
import fs from "fs";
import path from "path";
import {loadOutcomeLibraryFromSelector} from "../outcomeLibrary/loadOutcomeLibraryFromSelector.js";
import {resolveCurrentBuildModeIds} from "./resolveCurrentBuildModeIds.js";
import type {StudioDeploymentRunView} from "./StudioDeploymentRunView.js";
import type {StudioDeploymentTargetSummary} from "./StudioDeploymentTargetSummary.js";
import {toStudioDeploymentRunView} from "./toStudioDeploymentRunView.js";
import type {ValidatedDeploymentRunRequest} from "./validateDeploymentRunRequest.js";

const DEPLOYMENT_OUTPUT_DIRNAME = "deployment";

export type StudioDeploymentRunResult =
    | {readonly status: "ok"; readonly view: StudioDeploymentRunView}
    | {readonly status: "target-not-found"}
    | {readonly status: "invalid-modes"; readonly error: string}
    | {readonly status: "load-error"; readonly error: string};

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
    private readonly resolveBuildModeIds: (projectRoot: string) => readonly string[] | undefined;

    constructor(
        externalDeploymentService: ExternalDeploymentServicing = new ExternalDeploymentService(),
        createLocalTarget: (outDir: string) => ExternalDeploymentTarget = (outDir) => createLocalJsonExternalDeploymentTarget({outDir}),
        readFile: (resolvedPath: string) => string = (resolvedPath) => fs.readFileSync(resolvedPath, "utf-8"),
        realpath: (resolvedPath: string) => string = (resolvedPath) => fs.realpathSync(resolvedPath),
        bundleReader: OutcomeLibraryBundleReading<string> = new OutcomeLibraryBundleReader<string>(),
        stakeEngineImporter: StakeEngineImporting<string> = new StakeEngineImporter<string>(),
        resolveBuildModeIds: (projectRoot: string) => readonly string[] | undefined = resolveCurrentBuildModeIds,
    ) {
        this.externalDeploymentService = externalDeploymentService;
        this.createLocalTarget = createLocalTarget;
        this.readFile = readFile;
        this.realpath = realpath;
        this.bundleReader = bundleReader;
        this.stakeEngineImporter = stakeEngineImporter;
        this.resolveBuildModeIds = resolveBuildModeIds;
    }

    public listTargets(projectRoot: string): StudioDeploymentTargetSummary[] {
        return this.buildRegistry(projectRoot)
            .list()
            .map((target) => ({id: target.id, version: target.version, requirements: target.requirements, capabilities: target.capabilities}));
    }

    // Looks the requested target up in the same registry listTargets() itself builds (so "is this
    // target even registered" can never disagree between the two calls), then rejects outright (status:
    // "invalid-modes") if any requested mode isn't one of the active project's own current build modes
    // (see resolveCurrentBuildModeIds) -- undefined buildModeIds means the current build's modes aren't
    // known, the same "nothing to check against" case the Configure step's own
    // describeBuildModesUnavailable treats as unblocked, so the request is never rejected on this account
    // alone. Only once that passes does it resolve every mode's own librarySelector (see
    // loadOutcomeLibraryFromSelector — the same json/bundle/stakeengine resolution the Outcome Libraries
    // tab's own Select/Compare already use, so a mode can deploy straight from a bundle the registry found
    // compatible, not only a hand-typed flat JSON file; the first mode/library that fails to load stops
    // the whole request before ExternalDeploymentService is ever called, since there's no well-formed
    // input to give it yet), then runs the one real pipeline call.
    public async run(projectRoot: string, request: ValidatedDeploymentRunRequest): Promise<StudioDeploymentRunResult> {
        const registry = this.buildRegistry(projectRoot);
        const target = registry.get(request.targetId);
        if (target === undefined) {
            return {status: "target-not-found"};
        }

        const buildModeIds = this.resolveBuildModeIds(projectRoot);
        if (buildModeIds !== undefined) {
            const staleModeNames = request.modes.map((mode) => mode.modeName).filter((modeName) => !buildModeIds.includes(modeName));
            if (staleModeNames.length > 0) {
                return {status: "invalid-modes", error: describeInvalidDeploymentModes(staleModeNames, buildModeIds)};
            }
        }

        const modes: ExternalDeploymentModeInput[] = [];
        for (const mode of request.modes) {
            const loaded = await loadOutcomeLibraryFromSelector(
                projectRoot,
                mode.librarySelector,
                this.bundleReader,
                this.stakeEngineImporter,
                this.readFile,
                this.realpath,
            );
            if (loaded.status === "load-error") {
                return {status: "load-error", error: `mode "${mode.modeName}": ${loaded.error}`};
            }
            modes.push({modeName: mode.modeName, library: loaded.library});
        }

        // A frozen target's own fields can't be reassigned (see ExternalDeploymentTargetRegistry), but
        // spreading it into a fresh object literal is exactly how the SDK's own docs describe building
        // a "preview" variant — a brand-new, unfrozen object, never a mutation of the registered one.
        const runnableTarget = request.publish ? target : {...target, runtimeAdapter: undefined};
        const result = await this.externalDeploymentService.deploy(runnableTarget, modes);
        return {status: "ok", view: toStudioDeploymentRunView(result, target.id, request.publish)};
    }

    private buildRegistry(projectRoot: string): ExternalDeploymentTargetRegistry {
        const registry = new ExternalDeploymentTargetRegistry();
        registry.register(this.createLocalTarget(path.join(projectRoot, DEPLOYMENT_OUTPUT_DIRNAME, "local-json-example")));
        return registry;
    }
}
