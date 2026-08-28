import {
    ArtifactBuilderRegistry,
    ArtifactConversionPlanningOptions,
    ArtifactConversionPlan,
    ArtifactTargetType,
    ProjectResolving,
    ProjectTargetResolver,
} from "pokie";
import {createUnresolvedRuntimePlan} from "./createExternalArtifactConversionPlan.js";

/** Resolves the opened Studio project once and exposes the library planner to Studio adapters. */
export interface StudioArtifactConversionPlanning {
    prepare(
        projectRoot: string,
        target: ArtifactTargetType,
        destinationPath?: string,
        options?: Omit<ArtifactConversionPlanningOptions, "destinationPath">,
    ): Promise<ArtifactConversionPlan>;
}

/**
 * Thin Studio boundary over ArtifactBuilderRegistry.preparePlan().  A Studio action may
 * still receive a directory that is not a registered POKIE project (for example a
 * standalone JSON library selector).  That is still a terminal planner result: no
 * adapter is allowed to turn a failed recognition into an unplanned legacy read.
 */
export class StudioArtifactConversionPlanningService implements StudioArtifactConversionPlanning {
    private readonly resolver: ProjectResolving;
    private readonly registry: ArtifactBuilderRegistry;

    public constructor(
        pokieVersion: string,
        resolver: ProjectResolving = new ProjectTargetResolver(),
        registry: ArtifactBuilderRegistry = new ArtifactBuilderRegistry(pokieVersion),
    ) {
        this.resolver = resolver;
        this.registry = registry;
    }

    public async prepare(
        projectRoot: string,
        target: ArtifactTargetType,
        destinationPath?: string,
        options: Omit<ArtifactConversionPlanningOptions, "destinationPath"> = {},
    ): Promise<ArtifactConversionPlan> {
        try {
            const source = await this.resolver.resolve(projectRoot);
            return source === undefined
                ? createUnresolvedRuntimePlan(projectRoot, target, destinationPath)
                : this.registry.preparePlan(source, target, {...options, destinationPath});
        } catch {
            // Recognition failure is an explicit unavailable boundary.  The empty
            // capability set in createUnresolvedRuntimePlan intentionally prevents
            // this from advertising an executable package conversion.
            return createUnresolvedRuntimePlan(projectRoot, target, destinationPath);
        }
    }
}
