import {
    ArtifactBuilderRegistry,
    ArtifactConversionPlanningOptions,
    ArtifactConversionPlan,
    ArtifactTargetType,
    type PokieProject,
    ProjectResolving,
    ProjectTargetResolver,
} from "pokie";
import fs from "fs";
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
 * Resolves the source represented by a Studio project location. A managed
 * Blueprint has a file identity, while Studio also accepts its containing
 * directory when reopening or acting on it from the dashboard.
 */
export async function resolveStudioProjectSource(
    resolver: ProjectResolving,
    projectRoot: string,
): Promise<PokieProject | undefined> {
    // Freeze the Studio selector before the first asynchronous resolver
    // boundary.  A managed project is represented by the canonical file it
    // owns, never by a relative dashboard selector whose meaning could change
    // while a preflight/job is in flight.
    const resolvedProjectRoot = path.resolve(projectRoot);

    // A saved Design Game normally enters Studio through blueprint.json
    // itself. Do not manufacture a child selector beneath that file before
    // resolving it: a file is already the canonical provenance boundary.
    // Managed directories keep the Blueprint-first ordering below so an
    // adjacent generated package cannot take ownership of the project.
    try {
        if (fs.statSync(resolvedProjectRoot).isFile()) {
            return await resolver.resolve(resolvedProjectRoot);
        }
    } catch {
        // Preserve the ordinary resolver contract below for missing and
        // inaccessible user-selected paths.
    }
    const managedBlueprintPath = path.join(resolvedProjectRoot, "blueprint.json");
    // Studio-managed projects own blueprint.json as their editable source.
    // Resolve it before the enclosing directory: a generated or partially
    // cleaned-up sibling must never change a managed Blueprint operation into
    // a different source kind between preflight and retry.
    try {
        const managedBlueprint = await resolver.resolve(managedBlueprintPath);
        if (managedBlueprint?.type === "blueprint") return managedBlueprint;
    } catch {
        // A malformed sibling must not prevent direct file/package projects
        // from retaining their normal resolver path below.
    }

    try {
        const direct = await resolver.resolve(resolvedProjectRoot);
        if (direct !== undefined) return direct;
    } catch {
        // A managed Blueprint's enclosing directory can contain an unrelated
        // malformed artifact candidate. That must not make Studio forget the
        // durable blueprint.json source it created and registered there.
    }

    return undefined;
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
            const source = await resolveStudioProjectSource(this.resolver, projectRoot);
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
