import {
    ArtifactBuilderRegistry,
    ArtifactConversionPlanningOptions,
    ArtifactConversionPlan,
    ArtifactTargetType,
    ProjectResolving,
    ProjectTargetResolver,
} from "pokie";
import path from "path";
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
 * Thin Studio boundary over ArtifactBuilderRegistry.preparePlan(). Studio's managed
 * Blueprint creation convention stores its recognized source as blueprint.json inside
 * the project directory. Accepting that managed directory preserves the same canonical
 * Blueprint identity as opening its file directly; arbitrary unresolved selectors still
 * remain a terminal planner result.
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
            const source = await this.resolveStudioSource(projectRoot);
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

    /**
     * A managed Blueprint Project is represented by its durable blueprint.json
     * source, even when a Studio caller supplies its containing project
     * directory. Resolve that file through the regular project resolver rather
     * than inventing capabilities from the directory name or registry state.
     */
    private async resolveStudioSource(projectRoot: string) {
        const direct = await this.resolver.resolve(projectRoot);
        if (direct !== undefined) return direct;
        return this.resolver.resolve(path.join(projectRoot, "blueprint.json"));
    }
}
