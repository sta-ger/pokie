import {describeUnsupportedProjectOperation, PokieOperation, PokieProject, ProjectMaterializing, ProjectResolving, ProjectTargetResolver} from "pokie";
import {withLocalPokieInstall} from "../prepare/PackageCommandRunner.js";
import {BlueprintProjectMaterializer} from "./BlueprintProjectMaterializer.js";
import {UnsupportedProjectOperationError} from "./UnsupportedProjectOperationError.js";

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
// before the operation ever touches loadPokieGame. A resolved "tsPackage" already has everything
// `operation` needs, so it passes straight through (its own rootPath, not the caller's raw string --
// harmless, since ProjectTargetResolver only ever resolved it in the first place because it already
// existed on disk). A path ProjectResolving doesn't recognize as any known project type at all -- or that
// fails to resolve outright -- is handed back exactly as given, never routed through the materializer or
// checked against `operation`, so behavior against an arbitrary, unrecognized path stays byte-for-byte
// compatible with every operation's pre-materialization behavior. Anything else resolved -- an
// outcomeLibrary/stakeAdapter/parWorkbook/wasm project `operation` has no capability to run against --
// throws an UnsupportedProjectOperationError (see describeUnsupportedProjectOperation) instead of ever
// reaching loadPokieGame with a path it could only fail against in a confusing, capability-blind way. A
// materialization failure (a BlueprintMaterializationError, carrying which phase failed) propagates
// straight out of the returned function -- never caught or rewrapped here -- so a caller can only ever
// reach loadPokieGame with a genuinely materialized runtime, never after a failed one.
//
// `pokiePackageRoot` -- the running POKIE installation's own root directory (see cli/pokie.ts's
// readOwnPackageRoot()) -- is what lets the default materializer's own "npm install" resolve its
// generated "pokie" dependency against this exact installation (via withLocalPokieInstall) instead of a
// registry, so a Blueprint materializes offline even when the running version has never been published.
// Optional only so a caller that already supplies its own `materializer` (every test below) never has to
// pass a real filesystem path it doesn't need; every real production call site (cli/pokie.ts,
// StudioCommand) always passes one.
export function createMaterializingRuntimePackageResolver(
    pokieVersion: string,
    operation: PokieOperation,
    pokiePackageRoot?: string,
    dependencies: MaterializingRuntimePackageResolverDependencies = {},
): RuntimePackageResolving {
    const resolveProject = dependencies.resolveProject ?? new ProjectTargetResolver();
    const materializer =
        dependencies.materializer ??
        new BlueprintProjectMaterializer(
            pokieVersion,
            undefined,
            undefined,
            undefined,
            pokiePackageRoot !== undefined ? withLocalPokieInstall(pokiePackageRoot) : undefined,
        );

    return async (packageRoot: string): Promise<RuntimePackageResolution> => {
        const project: PokieProject | undefined = await resolveProject.resolve(packageRoot);
        if (project === undefined) {
            return {runtimePath: packageRoot, release: noRelease};
        }

        if (project.type === "blueprint") {
            const materialized = await materializer.materialize(project);
            return {runtimePath: materialized.runtimePath, release: materialized.release};
        }

        const diagnostic = describeUnsupportedProjectOperation(project, operation);
        if (diagnostic !== undefined) {
            throw new UnsupportedProjectOperationError(diagnostic);
        }

        return {runtimePath: project.rootPath, release: noRelease};
    };
}
