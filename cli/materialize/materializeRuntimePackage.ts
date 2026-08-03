import {PokieProject, ProjectMaterializing, ProjectResolving, ProjectTargetResolver} from "pokie";
import {BlueprintProjectMaterializer} from "./BlueprintProjectMaterializer.js";

// What every CLI runtime operation (sim/dev/serve/replay, Studio's Play runtime) gets back once it's
// crossed the boundary below -- "runtimePath" is what it should hand to loadPokieGame (or a worker
// thread's own packageRoot) from that point on instead of its own caller-given path, and "release" must
// be called once the operation is done with it (safe to call unconditionally -- see
// ProjectMaterializationResult's own doc comment on why a borrowed/passthrough result's release() is
// always a no-op).
export type RuntimePackageResolution = {
    readonly runtimePath: string;
    release(): Promise<void>;
};

export type RuntimePackageResolving = (packageRoot: string) => Promise<RuntimePackageResolution>;

const noRelease = (): Promise<void> => Promise.resolve();

// The default for every call site that hasn't been wired to a real resolver -- hands packageRoot back
// completely untouched. This is what keeps every existing caller (and every test constructing a command
// without this dependency) behaving exactly as if this boundary didn't exist yet.
export const passthroughRuntimePackageResolver: RuntimePackageResolving = (packageRoot) =>
    Promise.resolve({runtimePath: packageRoot, release: noRelease});

export type MaterializingRuntimePackageResolverDependencies = {
    resolveProject?: ProjectResolving;
    materializer?: ProjectMaterializing;
};

// The one place every CLI runtime operation that loads a POKIE game package should cross from "a
// caller-given path" to "a real, loadable runtime" -- resolves the given path via ProjectResolving and,
// only for a resolved "blueprint" PokieProject, materializes it into a real, built-and-installed runtime
// via BlueprintProjectMaterializer (see that class's own doc comment for what "materialized" means)
// before the operation ever touches loadPokieGame. Anything else -- an already-runtime-shaped
// "tsPackage", a path ProjectResolving doesn't recognize as any known project type, or a path that fails
// to resolve outright -- is handed back exactly as given, never routed through the materializer, so
// TypeScript-package behavior stays byte-for-byte compatible with every operation's pre-materialization
// behavior. A materialization failure (a BlueprintMaterializationError, carrying which phase failed)
// propagates straight out of the returned function -- never caught or rewrapped here -- so a caller can
// only ever reach loadPokieGame with a genuinely materialized runtime, never after a failed one.
export function createMaterializingRuntimePackageResolver(
    pokieVersion: string,
    dependencies: MaterializingRuntimePackageResolverDependencies = {},
): RuntimePackageResolving {
    const resolveProject = dependencies.resolveProject ?? new ProjectTargetResolver();
    const materializer = dependencies.materializer ?? new BlueprintProjectMaterializer(pokieVersion);

    return async (packageRoot: string): Promise<RuntimePackageResolution> => {
        const project: PokieProject | undefined = await resolveProject.resolve(packageRoot);
        if (project === undefined || project.type !== "blueprint") {
            return {runtimePath: packageRoot, release: noRelease};
        }

        const materialized = await materializer.materialize(project);
        return {runtimePath: materialized.runtimePath, release: materialized.release};
    };
}
