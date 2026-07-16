import {
    createLocalJsonExternalDeploymentTarget,
    ExternalDeploymentModeInput,
    ExternalDeploymentService,
    ExternalDeploymentServicing,
    ExternalDeploymentTarget,
    ExternalDeploymentTargetRegistry,
} from "pokie";
import fs from "fs";
import path from "path";
import {loadWeightedOutcomeLibraryFromProjectFile} from "./loadWeightedOutcomeLibraryFromProjectFile.js";
import type {StudioDeploymentRunView} from "./StudioDeploymentRunView.js";
import type {StudioDeploymentTargetSummary} from "./StudioDeploymentTargetSummary.js";
import {toStudioDeploymentRunView} from "./toStudioDeploymentRunView.js";
import type {ValidatedDeploymentRunRequest} from "./validateDeploymentRunRequest.js";

const DEPLOYMENT_OUTPUT_DIRNAME = "deployment";

export type StudioDeploymentRunResult =
    | {readonly status: "ok"; readonly view: StudioDeploymentRunView}
    | {readonly status: "target-not-found"}
    | {readonly status: "load-error"; readonly error: string};

// The Project Dashboard's Deployment tab, built directly on top of the pokie package's own External
// Adapter SDK (see docs/external-adapter-sdk.md) — this class never projects a RoundArtifact, never
// generates artifacts, and never validates a compatibility/artifact-shape concern itself; every one of
// those already-solved problems is delegated straight to ExternalDeploymentService.deploy(), the SDK's
// own single orchestrator. What this class actually owns is Studio-specific plumbing only: which
// target(s) are available for the active project (a registry seeded with exactly the SDK's own
// local-filesystem example target — see docs/cli.md's own "no private RGS integration" note, which
// applies here too), and turning a validated HTTP request into the SDK's own input shapes.
//
// "Preview" vs "Deploy" is not two different pipelines — it's the exact same deploy() call against two
// different target objects: publish:false strips `runtimeAdapter` (so ExternalDeploymentService's own
// existing "only calls runtimeAdapter.deliver() when the target declares one" behavior means nothing
// is ever written to disk), publish:true keeps it. See run()'s own doc comment.
export class StudioDeploymentService {
    private readonly externalDeploymentService: ExternalDeploymentServicing;
    private readonly createLocalTarget: (outDir: string) => ExternalDeploymentTarget;
    private readonly readFile: (resolvedPath: string) => string;

    constructor(
        externalDeploymentService: ExternalDeploymentServicing = new ExternalDeploymentService(),
        createLocalTarget: (outDir: string) => ExternalDeploymentTarget = (outDir) => createLocalJsonExternalDeploymentTarget({outDir}),
        readFile: (resolvedPath: string) => string = (resolvedPath) => fs.readFileSync(resolvedPath, "utf-8"),
    ) {
        this.externalDeploymentService = externalDeploymentService;
        this.createLocalTarget = createLocalTarget;
        this.readFile = readFile;
    }

    public listTargets(projectRoot: string): StudioDeploymentTargetSummary[] {
        return this.buildRegistry(projectRoot)
            .list()
            .map((target) => ({id: target.id, version: target.version, requirements: target.requirements, capabilities: target.capabilities}));
    }

    // Looks the requested target up in the same registry listTargets() itself builds (so "is this
    // target even registered" can never disagree between the two calls), loads every mode's own
    // library file (see loadWeightedOutcomeLibraryFromProjectFile — the first mode/library that fails
    // to load stops the whole request before ExternalDeploymentService is ever called, since there's
    // no well-formed input to give it yet), then runs the one real pipeline call.
    public async run(projectRoot: string, request: ValidatedDeploymentRunRequest): Promise<StudioDeploymentRunResult> {
        const registry = this.buildRegistry(projectRoot);
        const target = registry.get(request.targetId);
        if (target === undefined) {
            return {status: "target-not-found"};
        }

        const modes: ExternalDeploymentModeInput[] = [];
        for (const mode of request.modes) {
            const loaded = loadWeightedOutcomeLibraryFromProjectFile(projectRoot, mode.libraryPath, this.readFile);
            if (loaded.status === "error") {
                return {status: "load-error", error: `mode "${mode.modeName}": ${loaded.message}`};
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
