import fs from "fs";
import os from "os";
import path from "path";
import {
    ArtifactConversionPlanner,
    PokieProject,
    ProjectMaterializationResult,
    ProjectMaterializing,
    type ProjectMaterializationOptions,
} from "pokie";
import {BlueprintArtifactBuilder} from "../../src/project/BlueprintArtifactBuilder.js";
import {computeArtifactInputBindingHash} from "../../src/project/ArtifactConversionPlanner.js";

/**
 * The runtime counterpart to the durable artifact registry.  It follows the
 * planner's destinationless runtime plan: native packages are borrowed,
 * Blueprints use the verified runtime cache, and PAR is imported into a
 * private Blueprint/evidence stage which is removed when the lease ends.
 */
export class RunnableArtifactMaterializer implements ProjectMaterializing {
    private readonly blueprintMaterializer: ProjectMaterializing;
    private readonly planner: ArtifactConversionPlanner;
    private readonly blueprintBuilder: BlueprintArtifactBuilder;

    public constructor(
        blueprintMaterializer: ProjectMaterializing,
        planner = new ArtifactConversionPlanner(),
        blueprintBuilder = new BlueprintArtifactBuilder(),
    ) {
        this.blueprintMaterializer = blueprintMaterializer;
        this.planner = planner;
        this.blueprintBuilder = blueprintBuilder;
    }

    public async materialize(project: PokieProject, options: ProjectMaterializationOptions = {}): Promise<ProjectMaterializationResult> {
        this.assertNotCancelled(options.signal);
        const plan = this.planner.planRuntime(project);
        if (plan.status !== "planned") {
            throw new Error(this.describeUnavailable(plan));
        }
        if (project.type !== "parWorkbook") {
            return this.blueprintMaterializer.materialize(project, options);
        }

        // The temporary directory is operation-owned.  BlueprintArtifactBuilder
        // writes both imported model and evidence atomically, and this finally
        // removes both on every failure/cancellation/release path.
        const stage = await fs.promises.mkdtemp(path.join(os.tmpdir(), "pokie-runtime-par-"));
        const blueprintPath = path.join(stage, "imported.blueprint.json");
        let result: ProjectMaterializationResult | undefined;
        let released = false;
        const release = async (): Promise<void> => {
            if (released) return;
            released = true;
            try {
                await result?.release();
            } finally {
                await fs.promises.rm(stage, {recursive: true, force: true});
            }
        };
        try {
            this.assertNotCancelled(options.signal);
            await this.blueprintBuilder.build(project, blueprintPath, {signal: options.signal});
            this.assertNotCancelled(options.signal);
            result = await this.blueprintMaterializer.materialize({
                type: "blueprint",
                rootPath: blueprintPath,
                provenance: `temporary runtime import from PAR workbook ${project.rootPath}`,
                capabilities: plan.steps[0].output.capabilities,
                configurationProvenance: {configurationHash: computeArtifactInputBindingHash([project.rootPath])},
            }, {
                ...options,
                // A workbook's bytes participate even if two workbooks happen
                // to import to the same Blueprint model.
                cacheIdentity: computeArtifactInputBindingHash([project.rootPath]),
            });
            this.assertNotCancelled(options.signal);
            return {runtimePath: result.runtimePath, ownsRuntimePath: result.ownsRuntimePath, release};
        } catch (error) {
            await release();
            throw error;
        }
    }

    private assertNotCancelled(signal: AbortSignal | undefined): void {
        if (signal?.aborted) throw new Error("Runtime preparation was cancelled before a runnable game was available.");
    }

    private describeUnavailable(plan: ReturnType<ArtifactConversionPlanner["planRuntime"]>): string {
        const diagnostic = plan.diagnostic!;
        const path = plan.source.canonicalLocation === undefined ? "the requested artifact" : JSON.stringify(plan.source.canonicalLocation);
        const steps = plan.steps.length === 0 ? "no reusable runtime stages" : plan.steps.map((step) => `${step.choice} ${step.kind}`).join(", ");
        return `Cannot prepare a runnable runtime from ${path}. Attempted path: ${plan.source.kind} -> tsPackage; reusable steps: ${steps}; blocker at ${diagnostic.failedEdge.from} -> ${diagnostic.failedEdge.to}: ${diagnostic.message} Next: ${diagnostic.recovery}`;
    }
}
