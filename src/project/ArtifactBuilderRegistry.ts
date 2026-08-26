import type {ArtifactBuilder} from "./ArtifactBuilder.js";
import {ArtifactBuildConflictError} from "./ArtifactBuildConflictError.js";
import type {ArtifactBuildResult} from "./ArtifactBuildResult.js";
import type {ArtifactBuildTargetDescriptor} from "./ArtifactBuildTargetDescriptor.js";
import type {ArtifactDestinationCheck} from "./ArtifactDestinationCheck.js";
import type {ArtifactTargetType} from "./ArtifactTargetType.js";
import {assertArtifactDestinationAvailable} from "./internal/assertArtifactDestinationAvailable.js";
import {assertArtifactDestinationIsSafe} from "./internal/assertArtifactDestinationIsSafe.js";
import {OutcomeLibraryArtifactBuilder} from "./OutcomeLibraryArtifactBuilder.js";
import {ParWorkbookArtifactBuilder} from "./ParWorkbookArtifactBuilder.js";
import type {PokieProject} from "./PokieProject.js";
import {
    BUILD_OPERATION,
    OPERATION_REQUIRED_CAPABILITY,
    OUTCOME_LIBRARY_BUILD_OPERATION,
    PAR_EXPORT_OPERATION,
    STAKE_ENGINE_EXPORT_OPERATION,
    type PokieOperation,
} from "./PokieOperation.js";
import type {ProjectType} from "./ProjectType.js";
import {StakeAdapterArtifactBuilder} from "./StakeAdapterArtifactBuilder.js";
import {TsPackageArtifactBuilder} from "./TsPackageArtifactBuilder.js";
import {BlueprintStakeOutcomeLibraryWorkflow} from "./BlueprintStakeOutcomeLibraryWorkflow.js";
import {ManagedOutcomeProjectService, type ManagedOutcomeProjectServicing} from "./ManagedOutcomeProjectService.js";
import {loadGameBlueprint} from "../generated/loadGameBlueprint.js";
import {loadPokieGame} from "../gamepackage/loadPokieGame.js";
import {GameBlueprintValidator} from "../generated/GameBlueprintValidator.js";
import {resolveReelStripGeneration} from "../generated/resolveReelStripGeneration.js";
import type {GameBlueprint} from "../generated/GameBlueprint.js";
import type {ArtifactBuildOptions} from "./ArtifactBuildOptions.js";
import {
    ADVERTISED_ARTIFACT_BUILD_TARGETS,
    BUILD_PRODUCT_MATRIX_SOURCE_TYPES,
    describeBuildProductMatrixDiagnostic,
    getBuildProductMatrixCell,
} from "./BuildProductMatrix.js";

// Which PokieOperation actually produces each ArtifactTargetType as a brand-new artifact -- "build" writes a
// tsPackage, "outcomeLibrary.build" writes an outcomeLibrary bundle, "stakeEngine.export" writes a stakeAdapter
// export, and "par.export" writes a parWorkbook file. Every other
// PokieOperation (sim, replay, validate, ...) reads an already-built project rather than producing a new
// artifact type, so has no entry here -- this map is deliberately only the "build direction" subset of
// PokieOperation.
const TARGET_OPERATION: Readonly<Record<ArtifactTargetType, PokieOperation>> = {
    tsPackage: BUILD_OPERATION,
    outcomeLibrary: OUTCOME_LIBRARY_BUILD_OPERATION,
    stakeAdapter: STAKE_ENGINE_EXPORT_OPERATION,
    parWorkbook: PAR_EXPORT_OPERATION,
};

// Explicit, per-target statement of what building that target does NOT promise -- see
// ArtifactBuildTargetDescriptor's own "unsupportedNotes" field doc comment for why this exists as prose rather
// than being left for a reader to infer from an empty/narrow "supportedSources" array alone.
const UNSUPPORTED_NOTES: Readonly<Record<ArtifactTargetType, readonly string[]>> = {
    tsPackage: [
        "Builds a runnable package from a GameBlueprint source only -- never compiles or targets WASM.",
    ],
    outcomeLibrary: [
        "Republishes an existing weighted-outcome bundle, or materializes/generates one from a Blueprint or runnable package through the registry; " +
            "it never recovers a game model from an existing bundle.",
    ],
    stakeAdapter: [
        "Exports an already-computed canonical outcome library (or, for a Blueprint or runnable package, first resolves or generates and registers its compatible canonical outcome library) into Stake " +
            "Engine's own book-line format -- never re-derives or recovers the game model/blueprint that produced " +
            "those outcomes; that recovery is not supported by any builder.",
    ],
    parWorkbook: [
        "Exports a Game Blueprint as a deterministic PAR workbook snapshot, or republishes an existing " +
            "PAR workbook; it does not recover a Blueprint from unrelated package or outcome artifacts.",
    ],
};

function buildDescriptor(target: ArtifactTargetType): ArtifactBuildTargetDescriptor {
    const operation = TARGET_OPERATION[target];
    const requiredSourceCapability = OPERATION_REQUIRED_CAPABILITY[operation];
    if (requiredSourceCapability === undefined) {
        throw new Error(`ArtifactBuilderRegistry has no OPERATION_REQUIRED_CAPABILITY entry for "${operation}".`);
    }

    const sourceCells = BUILD_PRODUCT_MATRIX_SOURCE_TYPES.map((source) => getBuildProductMatrixCell(source, target));
    const supportedSources = sourceCells.filter((cell) => cell.state === "supported").map((cell) => cell.source);

    return {
        target,
        operation,
        requiredSourceCapability,
        supportedSources,
        sourceCells,
        unsupportedNotes: UNSUPPORTED_NOTES[target],
    };
}

// Every public target has a real, atomic builder. WASM is intentionally not an ArtifactTargetType: it is an
// inspection-only resolved project kind until POKIE ships a complete WASM producer and consumer workflow.
function buildDefaultBuilders(pokieVersion: string): ReadonlyMap<ArtifactTargetType, ArtifactBuilder> {
    return new Map<ArtifactTargetType, ArtifactBuilder>([
        ["tsPackage", new TsPackageArtifactBuilder(pokieVersion)],
        ["outcomeLibrary", new OutcomeLibraryArtifactBuilder(pokieVersion)],
        ["stakeAdapter", new StakeAdapterArtifactBuilder(pokieVersion)],
        ["parWorkbook", new ParWorkbookArtifactBuilder(pokieVersion)],
    ]);
}

// The single place a caller asks "what does building <target> require, and from which source types is that
// supported today" (describe/listTargets/supportsConversionFrom -- computed once from the same
// OPERATION_REQUIRED_CAPABILITY/PROJECT_TYPE_CAPABILITIES contracts describeUnsupportedProjectOperation already
// reads, never a second, independently-authored requirement), AND the single place that actually executes a
// build: build() re-checks the same capability describe() reports, then hands off to the concrete
// ArtifactBuilder already wired to POKIE's own already-atomic per-target writers (GamePackageGenerator,
// OutcomeLibraryBundleWriter, StakeEngineImporter/StakeEngineExporter, ParSheetImporter/ParSheetExporter) --
// see each builder's own doc comment for exactly what it reads/writes. Blueprint/tsPackage -> Outcome/Stake
// use the registry-owned prerequisite workflow, resolving a canonical Outcome Library before delegating back
// to the Stake builder; Blueprint -> parWorkbook writes a deterministic workbook snapshot, while
// outcomeLibrary -> outcomeLibrary, stakeAdapter -> stakeAdapter, and parWorkbook -> parWorkbook are the
// matrix's same-type republish cells. See UNSUPPORTED_NOTES for what each target's build explicitly does NOT
// promise.
export class ArtifactBuilderRegistry {
    private readonly descriptors: ReadonlyMap<ArtifactTargetType, ArtifactBuildTargetDescriptor>;
    private readonly builders: ReadonlyMap<ArtifactTargetType, ArtifactBuilder>;
    private readonly blueprintStakeWorkflow: BlueprintStakeOutcomeLibraryWorkflow;
    private readonly managedOutcomeProjects: ManagedOutcomeProjectServicing;

    constructor(
        pokieVersion = "0.0.0",
        builders: ReadonlyMap<ArtifactTargetType, ArtifactBuilder> = buildDefaultBuilders(pokieVersion),
        managedOutcomeProjects: ManagedOutcomeProjectServicing = new ManagedOutcomeProjectService(),
    ) {
        const descriptors = new Map<ArtifactTargetType, ArtifactBuildTargetDescriptor>();
        for (const target of Object.keys(TARGET_OPERATION) as ArtifactTargetType[]) {
            descriptors.set(target, buildDescriptor(target));
        }
        this.descriptors = descriptors;
        this.builders = builders;
        this.managedOutcomeProjects = managedOutcomeProjects;
        this.blueprintStakeWorkflow = new BlueprintStakeOutcomeLibraryWorkflow(pokieVersion, loadGameBlueprint, loadPokieGame, managedOutcomeProjects);
    }

    public withRuntimePackageRoot(pokiePackageRoot: string): this {
        const tsPackageBuilder = this.builders.get("tsPackage");
        if (tsPackageBuilder instanceof TsPackageArtifactBuilder) {
            tsPackageBuilder.withRuntimePackageRoot(pokiePackageRoot);
        }
        return this;
    }

    public listTargets(): readonly ArtifactTargetType[] {
        // A caller may inject a deliberately small builder set for an embedded use or a focused test.
        // Do not let that make the registry advertise a target it cannot actually produce: the default
        // production set contains every matrix target, while a partial set exposes only its complete
        // target promises.
        return ADVERTISED_ARTIFACT_BUILD_TARGETS.filter((target) => this.descriptors.has(target) && this.builders.has(target));
    }

    public describe(target: ArtifactTargetType): ArtifactBuildTargetDescriptor {
        const descriptor = this.descriptors.get(target);
        if (descriptor === undefined || !this.builders.has(target)) {
            throw new Error(
                `Build target "${target}" is unavailable in this POKIE installation. ` +
                    "Next: choose a target shown by `pokie build --help` or use an installation that provides this target.",
            );
        }
        return descriptor;
    }

    // Whether `source` grants the capability `target` requires -- the same check
    // describeUnsupportedProjectOperation performs for a PokieOperation, exposed target-first so a caller
    // building toward a specific artifact doesn't need to know which PokieOperation id backs it.
    public supportsConversionFrom(target: ArtifactTargetType, source: ProjectType): boolean {
        return getBuildProductMatrixCell(source, target).state === "supported";
    }

    // Reports whether `destinationPath` would be accepted by `target`'s own build() -- the exact same
    // assertArtifactDestinationAvailable() precondition build() enforces before ever invoking a builder, off
    // the same builder-owned destinationKind, but without invoking the builder (and so without ever reading
    // `source` or touching the filesystem beyond the same existence/emptiness check build() itself performs).
    // Lets a caller (a Studio build-preview panel) report the identical conflict a real build would hit
    // before ever attempting one, rather than re-deriving "file" vs "directory" per target itself.
    public checkDestination(target: ArtifactTargetType, destinationPath: string, sourcePath?: string): ArtifactDestinationCheck {
        this.assertTargetAvailable(target);
        const builder = this.builders.get(target);
        if (builder === undefined) throw new Error(this.unavailableTargetMessage(target));

        try {
            if (sourcePath !== undefined) assertArtifactDestinationIsSafe(sourcePath, destinationPath);
            assertArtifactDestinationAvailable(destinationPath, builder.destinationKind);
            return {available: true};
        } catch (error) {
            if (error instanceof ArtifactBuildConflictError) {
                return {available: false, message: error.message};
            }
            throw error;
        }
    }

    // Validates the same source/artifact contract a real build consumes, without allocating a destination
    // or invoking any writer. This is intentionally separate from checkDestination(): a usable output also
    // requires readable source data, so callers must not report dry-run success after checking only a path.
    public async validate(target: ArtifactTargetType, source: PokieProject): Promise<void> {
        if (!this.supportsConversionFrom(target, source.type)) {
            throw new Error(describeBuildProductMatrixDiagnostic(source.type, target, source.rootPath));
        }
        this.assertTargetAvailable(target);

        if (source.type === "blueprint" && target !== "parWorkbook") {
            const blueprint = loadGameBlueprint(source.rootPath);
            const errors = new GameBlueprintValidator().validate(blueprint).filter((issue) => issue.severity === "error");
            if (errors.length > 0) {
                throw new Error(`Blueprint "${source.rootPath}" has ${errors.length} error(s): ${errors.map((issue) => `${issue.code}: ${issue.message}`).join("; ")}`);
            }
            const resolution = resolveReelStripGeneration(blueprint as GameBlueprint);
            if (!resolution.success) throw new Error(`Blueprint "${source.rootPath}" could not generate its reel strips.`);
            return;
        }

        if (source.type === "tsPackage") {
            await loadPokieGame(source.rootPath);
            return;
        }

        const builder = this.builders.get(target);
        if (builder === undefined) throw new Error(this.unavailableTargetMessage(target));
        await builder.validate?.(source);
    }

    // Executes a real build: re-validates `source` against `target`'s own required capability (the exact
    // capability diagnostic describe()/supportsConversionFrom() already report, checked again here so build()
    // is safe to call directly without a caller re-deriving the same check itself), then hands off to the
    // registered ArtifactBuilder. Every ArtifactTargetType has a registered production builder.
    public build(target: ArtifactTargetType, source: PokieProject, destinationPath: string, options?: ArtifactBuildOptions): Promise<ArtifactBuildResult> {
        if (!this.supportsConversionFrom(target, source.type)) {
            return Promise.reject(new Error(describeBuildProductMatrixDiagnostic(source.type, target, source.rootPath)));
        }
        try {
            this.assertTargetAvailable(target);
        } catch (error) {
            return Promise.reject(error);
        }
        if (target === "outcomeLibrary" && (source.type === "blueprint" || source.type === "tsPackage")) {
            return this.buildManagedOutcomeFromRuntime(source, destinationPath, options);
        }
        if (target === "stakeAdapter" && (source.type === "blueprint" || source.type === "tsPackage")) {
            return this.blueprintStakeWorkflow
                .resolveOrGenerate(source, (compatibility) => this.managedOutcomeProjects.allocateRoot(source.rootPath, compatibility), options)
                .then(({project: outcomeLibrary}) =>
                    this.build("stakeAdapter", outcomeLibrary, destinationPath, options).then((result) => ({
                        ...result,
                        prerequisiteProjectRoots: [outcomeLibrary.rootPath],
                        managedProjectRoots: [outcomeLibrary.rootPath],
                    })),
                );
        }
        const builder = this.builders.get(target);
        if (builder === undefined) return Promise.reject(new Error(this.unavailableTargetMessage(target)));

        return builder.build(source, destinationPath, options);
    }

    private async buildManagedOutcomeFromRuntime(
        source: PokieProject,
        destinationPath: string,
        options?: ArtifactBuildOptions,
    ): Promise<ArtifactBuildResult> {
        // A requested --out is a real destination contract, even when a compatible managed Outcome
        // Project already exists.  Check it before the managed-project lookup: otherwise the lookup
        // turns an explicit destination into a silently ignored hint (and can bypass the normal
        // no-overwrite policy every other artifact target enforces).
        assertArtifactDestinationAvailable(destinationPath, "directory");
        assertArtifactDestinationIsSafe(source.rootPath, destinationPath);
        const outcomeLibrary = await this.blueprintStakeWorkflow.resolveOrGenerate(
            source,
            destinationPath,
            options,
            false,
        );
        return {
            outputPath: outcomeLibrary.project.rootPath,
            ...(outcomeLibrary.reused
                ? {requestedDestinationPath: destinationPath, reusedCompatibleProject: true}
                : {}),
            managedProjectRoots: [outcomeLibrary.project.rootPath],
        };
    }

    private unavailableTargetMessage(target: ArtifactTargetType): string {
        return (
            `Build target "${target}" is unavailable in this POKIE installation. ` +
            "Next: choose a target shown by `pokie build --help` or use an installation that provides this target."
        );
    }

    private assertTargetAvailable(target: ArtifactTargetType): void {
        if (!this.descriptors.has(target) || !this.builders.has(target)) {
            throw new Error(this.unavailableTargetMessage(target));
        }
    }

}
