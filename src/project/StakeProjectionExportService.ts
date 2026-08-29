import type {ArtifactBuildOptions, ArtifactBuildPreflight} from "./ArtifactBuildOptions.js";
import type {ArtifactBuildResult} from "./ArtifactBuildResult.js";
import {ArtifactBuilderRegistry} from "./ArtifactBuilderRegistry.js";
import {describeArtifactConversionPlanDiagnostic, type ArtifactConversionPlan} from "./ArtifactConversionPlanner.js";
import type {PokieProject} from "./PokieProject.js";

/**
 * The goal-oriented Stake projection boundary.  A Blueprint or package is a
 * complete Stake source: the registry prepares one immutable plan which
 * selects either a verified managed Outcome Library or generation, then
 * validates and publishes the Stake artifact.  CLI and Studio use this
 * boundary instead of treating an Outcome Library as a hidden prerequisite.
 *
 * Descriptor-based Stake exports intentionally remain outside this service:
 * their descriptor is an explicit Outcome Library input and cannot acquire
 * Blueprint/package provenance by passing through a project projection.
 */
export interface StakeProjectionExportServicing {
    prepare(source: PokieProject, destinationPath?: string, options?: ArtifactBuildOptions): Promise<ArtifactConversionPlan>;
    validate(source: PokieProject, prepared: ArtifactConversionPlan): Promise<void>;
    execute(
        source: PokieProject,
        destinationPath: string,
        prepared: ArtifactConversionPlan,
        options?: ArtifactBuildOptions,
    ): Promise<ArtifactBuildResult>;
}

/**
 * A Stake publish is deliberately a single prepared operation, rather than a
 * plan DTO which a caller can validate and then accidentally replace with a
 * fresh lookup.  The source, destination and generation request are retained
 * beside the registry plan so every interactive boundary executes exactly the
 * decision it showed during preflight.
 */
export type PreparedStakeProjectionOperation = {
    readonly source: PokieProject;
    readonly destinationPath: string;
    readonly plan: ArtifactConversionPlan;
    /** Read-only user-visible preflight bound to this immutable operation. */
    readonly preflight: StakeProjectionPreflight;
    readonly options?: Pick<ArtifactBuildOptions, "outcomeLibraryGeneration">;
};

export type StakeProjectionPreflight = ArtifactBuildPreflight & {
    readonly route: "reuse" | "generate" | "publish";
    readonly selectedPrerequisiteLocation?: string;
    /** Truthful explanations for metrics unavailable before generation finishes. */
    readonly unavailableMetrics?: readonly string[];
};

export class StakeProjectionExportService implements StakeProjectionExportServicing {
    private readonly registry: ArtifactBuilderRegistry;

    public constructor(registry: ArtifactBuilderRegistry) {
        this.registry = registry;
    }

    public prepare(source: PokieProject, destinationPath?: string, options?: ArtifactBuildOptions): Promise<ArtifactConversionPlan> {
        return this.registry.preparePlan(source, "stakeAdapter", {
            ...(destinationPath === undefined ? {} : {destinationPath}),
            outcomeLibraryGeneration: options?.outcomeLibraryGeneration,
        });
    }

    public async prepareOperation(
        source: PokieProject,
        destinationPath: string,
        options?: ArtifactBuildOptions,
    ): Promise<PreparedStakeProjectionOperation> {
        const preparedOptions = options?.outcomeLibraryGeneration === undefined
            ? undefined
            : {outcomeLibraryGeneration: options.outcomeLibraryGeneration};
        const plan = await this.prepare(source, destinationPath, preparedOptions);
        if (plan.status === "planned") await this.validate(source, plan);
        const reused = plan.steps.find((step) => step.kind === "reuseManagedOutcomeLibrary");
        const generated = plan.steps.some((step) => step.kind === "generateOutcomeLibrary");
        const estimate = plan.status === "planned"
            ? await this.registry.inspectPreparedStakePreflight(source, plan)
            : {};
        let route: StakeProjectionPreflight["route"] = "publish";
        if (reused !== undefined) route = "reuse";
        else if (generated) route = "generate";
        const preflight: StakeProjectionPreflight = {
            ...estimate,
            route,
            ...(reused?.output.canonicalLocation === undefined ? {} : {selectedPrerequisiteLocation: reused.output.canonicalLocation}),
            ...(generated ? {unavailableMetrics: ["Final Stake byte size is unavailable until the generated Outcome Library is materialized."]} : {}),
        };
        return {source, destinationPath, plan, preflight, ...(preparedOptions === undefined ? {} : {options: preparedOptions})};
    }

    /** Execute the immutable operation prepared for this exact destination. */
    public executeOperation(
        operation: PreparedStakeProjectionOperation,
        options?: ArtifactBuildOptions,
    ): Promise<ArtifactBuildResult> {
        return this.execute(operation.source, operation.destinationPath, operation.plan, {
            ...operation.options,
            ...options,
            // A caller may supply progress/cancellation at execution time,
            // but it must never replace the generation decision that was
            // bound when the operation was prepared.
            outcomeLibraryGeneration: operation.options?.outcomeLibraryGeneration,
        });
    }

    public validate(source: PokieProject, prepared: ArtifactConversionPlan): Promise<void> {
        return this.registry.validate("stakeAdapter", source, prepared);
    }

    public execute(
        source: PokieProject,
        destinationPath: string,
        prepared: ArtifactConversionPlan,
        options?: ArtifactBuildOptions,
    ): Promise<ArtifactBuildResult> {
        return this.registry.executePlan(prepared, source, destinationPath, options);
    }

    /** Stable terminal diagnostic for callers that render a preflight failure. */
    public describe(prepared: ArtifactConversionPlan): string | undefined {
        return describeArtifactConversionPlanDiagnostic(prepared) ?? prepared.diagnostic?.message;
    }
}
