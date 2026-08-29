import crypto from "crypto";
import fs from "fs";
import path from "path";
import {
    ArtifactConversionPlanner,
    describeUnsupportedProjectOperation,
    PokieOperation,
    PokieProject,
    ProjectMaterializing,
    ProjectResolving,
    ProjectTargetResolver,
    ProjectTargetMalformedError,
} from "pokie";
import {withLinkedLocalPokieRuntime} from "../prepare/PackageCommandRunner.js";
import {BlueprintProjectMaterializer} from "./BlueprintProjectMaterializer.js";
import {BlueprintMaterializationError} from "./BlueprintMaterializationError.js";
import {RunnableArtifactMaterializer} from "./RunnableArtifactMaterializer.js";
import {RuntimePreparationError} from "./RuntimePreparationError.js";
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

export type RuntimePackageResolutionOptions = {readonly signal?: AbortSignal};

export type RuntimePackageResolving = (packageRoot: string, options?: RuntimePackageResolutionOptions) => Promise<RuntimePackageResolution>;

const noRelease = (): Promise<void> => Promise.resolve();

// The local installation is the implementation a materialized Blueprint will actually load through
// withLocalPokieInstall. Its package metadata and compiled runtime are deliberately fingerprinted by
// bytes rather than mtime: rebuilding an unpublished checkout in place commonly preserves its version
// and path, while its dist output changes. The root path remains part of the fingerprint too, so two
// separate local installations with identical bytes cannot share a cache entry that npm later wires to
// different locations. A missing input still gets a stable path-specific identity; the normal running-
// installation path is readable.
export function createLocalRuntimeIdentity(pokiePackageRoot: string): string {
    const identity = crypto.createHash("sha256");
    const root = path.resolve(pokiePackageRoot);
    identity.update(`root:${root}\0`);
    for (const relativePath of ["package.json", "dist"]) {
        appendRuntimePathIdentity(identity, path.join(root, relativePath), relativePath, new Set<string>());
    }
    return identity.digest("hex");
}

function appendRuntimePathIdentity(identity: crypto.Hash, targetPath: string, relativePath: string, ancestorDirectories: Set<string>): void {
    let stats: fs.Stats;
    try {
        stats = fs.lstatSync(targetPath);
    } catch {
        identity.update(`missing:${relativePath}\0`);
        return;
    }

    if (stats.isDirectory()) {
        identity.update(`directory:${relativePath}\0`);
        const realDirectoryPath = fs.realpathSync(targetPath);
        if (ancestorDirectories.has(realDirectoryPath)) {
            identity.update(`cycle:${relativePath}\0`);
            return;
        }
        ancestorDirectories.add(realDirectoryPath);
        const entries = fs.readdirSync(targetPath, {withFileTypes: true}).sort((left, right) => compareFileNames(left.name, right.name));
        for (const entry of entries) {
            appendRuntimePathIdentity(identity, path.join(targetPath, entry.name), `${relativePath}/${entry.name}`, ancestorDirectories);
        }
        ancestorDirectories.delete(realDirectoryPath);
        return;
    }
    if (stats.isFile()) {
        identity.update(`file:${relativePath}\0`);
        identity.update(fs.readFileSync(targetPath));
        identity.update("\0");
        return;
    }
    if (stats.isSymbolicLink()) {
        identity.update(`symlink:${relativePath}:${fs.readlinkSync(targetPath)}\0`);
        try {
            appendRuntimePathIdentity(identity, fs.realpathSync(targetPath), relativePath, ancestorDirectories);
        } catch {
            identity.update(`broken-symlink:${relativePath}\0`);
        }
        return;
    }
    identity.update(`other:${relativePath}\0`);
}

function compareFileNames(left: string, right: string): number {
    if (left < right) {
        return -1;
    }
    if (left > right) {
        return 1;
    }
    return 0;
}

// The default for every call site that hasn't been wired to a real resolver -- hands packageRoot back
// completely untouched. This is what keeps every existing caller (and every test constructing a command
// without this dependency) behaving exactly as if this boundary didn't exist yet.
export const passthroughRuntimePackageResolver: RuntimePackageResolving = (packageRoot, options = {}) => {
    assertRuntimePreparationNotCancelled(options.signal);
    return Promise.resolve({runtimePath: packageRoot, release: noRelease});
};

export type MaterializingRuntimePackageResolverDependencies = {
    resolveProject?: ProjectResolving;
    materializer?: ProjectMaterializing;
};

// The one place every CLI runtime operation that loads a POKIE game package should cross from "a
// caller-given path" to "a real, loadable runtime" -- resolves the given path via ProjectResolving and,
// for a project that grants BLUEPRINT_BUILD_CAPABILITY, materializes it into a real, built-and-installed runtime
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
    // Even an injected materializer is a Blueprint-stage materializer.  Keep
    // PAR import/staging planner-owned so tests and host integrations cannot
    // accidentally receive an unsupported workbook directly.
    const blueprintMaterializer = dependencies.materializer ?? new BlueprintProjectMaterializer(
        pokieVersion,
        undefined,
        undefined,
        undefined,
        pokiePackageRoot !== undefined ? withLinkedLocalPokieRuntime(pokiePackageRoot) : undefined,
        undefined,
        undefined,
        pokiePackageRoot !== undefined ? createLocalRuntimeIdentity(pokiePackageRoot) : pokieVersion,
    );
    const materializer = new RunnableArtifactMaterializer(blueprintMaterializer);

    return async (packageRoot: string, options: RuntimePackageResolutionOptions = {}): Promise<RuntimePackageResolution> => {
        assertRuntimePreparationNotCancelled(options.signal);
        let project: PokieProject | undefined;
        try {
            project = await resolveProject.resolve(packageRoot);
        } catch (error) {
            if (error instanceof ProjectTargetMalformedError && error.targetType === "parWorkbook") {
                throw RuntimePreparationError.parWorkbookRecognition(path.resolve(packageRoot), error);
            }
            throw error;
        }
        // Resolving a project can include filesystem inspection.  Do not let a
        // cancellation that arrives there escape through an otherwise harmless
        // package/passthrough return and start a Studio job afterwards.
        assertRuntimePreparationNotCancelled(options.signal);
        if (project === undefined) {
            return {runtimePath: packageRoot, release: noRelease};
        }

        // Runtime preparation is planner-owned.  It may borrow a package,
        // materialize a Blueprint cache, or import PAR into a private stage;
        // none of those asks the user to publish a durable package first.
        const runtimePlan = new ArtifactConversionPlanner().planRuntime(project);
        if (project.type === "tsPackage") {
            assertRuntimePreparationNotCancelled(options.signal);
            return {runtimePath: project.rootPath, release: noRelease};
        }
        if (runtimePlan.status === "planned") {
            try {
                const materialized = await materializer.materialize(project, options);
                if (options.signal?.aborted) {
                    await materialized.release();
                    assertRuntimePreparationNotCancelled(options.signal);
                }
                return {runtimePath: materialized.runtimePath, release: materialized.release};
            } catch (error) {
                if (options.signal?.aborted) throw error;
                // Preserve the dedicated lifecycle error (including phase and
                // npm detail) for direct consumers while enriching its public
                // message with the planner-owned runtime path.
                if (error instanceof BlueprintMaterializationError) {
                    error.message = new RuntimePreparationError(project, runtimePlan, error).message;
                    throw error;
                }
                throw new RuntimePreparationError(project, runtimePlan, error);
            }
        }
        // Native Outcome Library routes are selected by their commands before
        // this boundary. Everything else retains the planner's attempted path
        // and failed conversion edge instead of being mislabeled as a bad
        // package validation problem.
        const diagnostic = describeUnsupportedProjectOperation(project, operation);
        const plannerDiagnostic = runtimePlan.diagnostic!;
        const plannerMessage = `Cannot prepare a runnable runtime from ${JSON.stringify(project.rootPath)}. Attempted path: ${project.type} -> tsPackage; reusable steps: ${runtimePlan.steps.length === 0 ? "none" : runtimePlan.steps.map((step) => `${step.choice} ${step.kind}`).join(", ")}; blocker at ${plannerDiagnostic.failedEdge.from} -> ${plannerDiagnostic.failedEdge.to}: ${plannerDiagnostic.message} Next: ${plannerDiagnostic.recovery}`;
        throw new UnsupportedProjectOperationError({
            ...(diagnostic ?? {
                operation,
                detectedType: project.type,
                missingCapability: "runtime.execute",
                alternatives: [],
            }),
            // Outcome Library is intentionally kept on its native paths; its
            // established open-Studio diagnostic remains the clearest recovery.
            message: project.type === "outcomeLibrary" && diagnostic !== undefined
                ? diagnostic.message
                : `${diagnostic?.message === undefined ? "" : `${diagnostic.message} `}${plannerMessage}`,
        });
    };
}

function assertRuntimePreparationNotCancelled(signal: AbortSignal | undefined): void {
    if (signal?.aborted) throw new Error("Runtime preparation was cancelled before a runnable game was available.");
}
