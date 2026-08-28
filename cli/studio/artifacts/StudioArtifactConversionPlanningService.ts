import {
    ArtifactBuilderRegistry,
    ArtifactConversionPlan,
    ArtifactTargetType,
    ProjectResolving,
    ProjectTargetResolver,
} from "pokie";

/** Resolves the opened Studio project once and exposes the library planner to Studio adapters. */
export interface StudioArtifactConversionPlanning {
    prepare(projectRoot: string, target: ArtifactTargetType, destinationPath?: string): Promise<ArtifactConversionPlan | undefined>;
}

/**
 * Thin Studio boundary over ArtifactBuilderRegistry.preparePlan().  A Studio action may
 * still receive a directory that is not a registered POKIE project (for example a
 * standalone JSON library selector); in that case there is deliberately no invented
 * source identity or client-side fallback plan.
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

    public async prepare(projectRoot: string, target: ArtifactTargetType, destinationPath?: string): Promise<ArtifactConversionPlan | undefined> {
        try {
            const source = await this.resolver.resolve(projectRoot);
            return source === undefined ? undefined : this.registry.preparePlan(source, target, {destinationPath});
        } catch {
            // The action's established reader owns diagnostics for an unrecognizable
            // external selector.  Do not manufacture a source identity just to make a
            // plan-shaped error.
            return undefined;
        }
    }
}
