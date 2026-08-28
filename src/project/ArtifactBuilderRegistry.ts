import type {ArtifactBuilder} from "./ArtifactBuilder.js";
import fs from "fs";
import path from "path";
import {ArtifactBuildConflictError} from "./ArtifactBuildConflictError.js";
import type {ArtifactBuildResult, ManagedOutcomeProjectOwnership} from "./ArtifactBuildResult.js";
import type {ArtifactBuildTargetDescriptor} from "./ArtifactBuildTargetDescriptor.js";
import type {ArtifactDestinationCheck} from "./ArtifactDestinationCheck.js";
import type {ArtifactTargetType} from "./ArtifactTargetType.js";
import {assertArtifactDestinationAvailable} from "./internal/assertArtifactDestinationAvailable.js";
import {assertArtifactDestinationIsSafe} from "./internal/assertArtifactDestinationIsSafe.js";
import {OutcomeLibraryArtifactBuilder} from "./OutcomeLibraryArtifactBuilder.js";
import {ParWorkbookArtifactBuilder} from "./ParWorkbookArtifactBuilder.js";
import {BlueprintArtifactBuilder} from "./BlueprintArtifactBuilder.js";
import type {PokieProject} from "./PokieProject.js";
import {
    BUILD_OPERATION,
    OPERATION_REQUIRED_CAPABILITY,
    OUTCOME_LIBRARY_BUILD_OPERATION,
    PAR_EXPORT_OPERATION,
    PAR_IMPORT_OPERATION,
    STAKE_ENGINE_EXPORT_OPERATION,
    type PokieOperation,
} from "./PokieOperation.js";
import type {ProjectType} from "./ProjectType.js";
import {PROJECT_TYPE_CAPABILITIES} from "./ProjectCapabilities.js";
import {StakeAdapterArtifactBuilder} from "./StakeAdapterArtifactBuilder.js";
import {TsPackageArtifactBuilder} from "./TsPackageArtifactBuilder.js";
import {BlueprintStakeOutcomeLibraryWorkflow} from "./BlueprintStakeOutcomeLibraryWorkflow.js";
import {ManagedOutcomeProjectService, type ManagedOutcomeProjectServicing} from "./ManagedOutcomeProjectService.js";
import {loadGameBlueprint} from "../generated/loadGameBlueprint.js";
import {loadPokieGame} from "../gamepackage/loadPokieGame.js";
import {GameBlueprintValidator} from "../generated/GameBlueprintValidator.js";
import {resolveReelStripGeneration} from "../generated/resolveReelStripGeneration.js";
import type {GameBlueprint} from "../generated/GameBlueprint.js";
import {assertArtifactBuildNotCancelled, type ArtifactBuildOptions} from "./ArtifactBuildOptions.js";
import {ArtifactConversionPlanner, computeArtifactInputBindingHash, describeArtifactConversionPlanDiagnostic, resolveArtifactIdentity, type ArtifactConfigurationProvenance, type ArtifactConversionPlan, type ArtifactConversionPlanningOptions, type ArtifactIdentity} from "./ArtifactConversionPlanner.js";
import {
    ADVERTISED_ARTIFACT_BUILD_TARGETS,
    BUILD_PRODUCT_MATRIX_SOURCE_TYPES,
    getBuildProductMatrixCell,
} from "./BuildProductMatrix.js";

/**
 * The prepared-operation destination boundary shared by registry builds and
 * adapters that publish a format directly.  In particular, an adapter must
 * not reinterpret an explicit overwrite confirmation as permission to bypass
 * the source-alias or occupied-output checks enforced by every registry
 * build.
 */
export function assertPreparedArtifactDestinationAvailable(
    sourcePath: string | undefined,
    destinationPath: string,
    kind: "file" | "directory",
): void {
    if (sourcePath !== undefined) assertArtifactDestinationIsSafe(sourcePath, destinationPath);
    assertArtifactDestinationAvailable(destinationPath, kind);
}

// Which PokieOperation actually produces each ArtifactTargetType as a brand-new artifact -- "build" writes a
// tsPackage, "outcomeLibrary.build" writes an outcomeLibrary bundle, "stakeEngine.export" writes a stakeAdapter
// export, and "par.export" writes a parWorkbook file. Every other
// PokieOperation (sim, replay, validate, ...) reads an already-built project rather than producing a new
// artifact type, so has no entry here -- this map is deliberately only the "build direction" subset of
// PokieOperation.
const TARGET_OPERATION: Readonly<Record<ArtifactTargetType, PokieOperation>> = {
    blueprint: PAR_IMPORT_OPERATION,
    tsPackage: BUILD_OPERATION,
    outcomeLibrary: OUTCOME_LIBRARY_BUILD_OPERATION,
    stakeAdapter: STAKE_ENGINE_EXPORT_OPERATION,
    parWorkbook: PAR_EXPORT_OPERATION,
};

// Explicit, per-target statement of what building that target does NOT promise -- see
// ArtifactBuildTargetDescriptor's own "unsupportedNotes" field doc comment for why this exists as prose rather
// than being left for a reader to infer from an empty/narrow "supportedSources" array alone.
const UNSUPPORTED_NOTES: Readonly<Record<ArtifactTargetType, readonly string[]>> = {
    blueprint: [
        "Imports a PAR workbook into a durable Game Blueprint with inspectable conversion evidence; it never recovers a game model from package, outcome, Stake, or WASM artifacts.",
    ],
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

function sameConfigurationProvenance(
    left: ArtifactConfigurationProvenance | undefined,
    right: ArtifactConfigurationProvenance | undefined,
): boolean {
    return left?.configurationHash === right?.configurationHash &&
        left?.pokieVersion === right?.pokieVersion &&
        left?.generationSemantics === right?.generationSemantics &&
        left?.gameId === right?.gameId &&
        left?.gameVersion === right?.gameVersion &&
        left?.manifestIdentity === right?.manifestIdentity &&
        left?.sampleCount === right?.sampleCount &&
        left?.sampleSeed === right?.sampleSeed;
}

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
        ["blueprint", new BlueprintArtifactBuilder()],
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
    private readonly planner = new ArtifactConversionPlanner();

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

    /**
     * Releases a managed Outcome record that was registered while executing a
     * plan which later failed at an outer publication boundary.  The caller
     * deliberately owns removing the corresponding files: this registry
     * method only reverses the managed-project publication and therefore
     * cannot delete a reused Outcome bundle.
     */
    public releaseManagedOutcomeProject(sourceRootPath: string, rootPath: string): Promise<void> {
        return this.managedOutcomeProjects.release(sourceRootPath, rootPath);
    }

    // The public conversion contract used by all adapters. The registry adds its filesystem-backed
    // destination policy to the pure planner result so previews and execution reject the same path.
    public async plan(
        source: PokieProject,
        target: ArtifactTargetType,
        options: ArtifactConversionPlanningOptions & Pick<ArtifactBuildOptions, "outcomeLibraryGeneration"> = {},
    ): Promise<ArtifactConversionPlan> {
        const preparedPlan = await this.preparePlan(source, target, options);
        return preparedPlan;
    }

    /**
     * Produces the plan used by a real build/preview.  Managed outcomes are
     * inspected before planning, with the exact generation key used by the
     * workflow, so the plan never advertises materialization and later reuses
     * (or the reverse).
     */
    public async preparePlan(
        source: PokieProject,
        target: ArtifactTargetType,
        options: ArtifactConversionPlanningOptions & Pick<ArtifactBuildOptions, "outcomeLibraryGeneration"> = {},
    ): Promise<ArtifactConversionPlan> {
        let plannedSource = source;
        let managedOutcome = options.managedOutcome;
        let planningOptions: ArtifactConversionPlanningOptions = options;
        // A caller can supply a project DTO without going through
        // ProjectTargetResolver (for example, an embedded CLI or API caller).
        // Bind PAR bytes here, at the registry's plan boundary, so execution's
        // drift guard always compares against a hash prepared for this plan.
        if (source.type === "parWorkbook") {
            plannedSource = {
                ...source,
                configurationProvenance: {
                    ...source.configurationProvenance,
                    configurationHash: computeArtifactInputBindingHash([source.rootPath]),
                },
            };
        }
        if ((source.type === "blueprint" || source.type === "tsPackage") && (target === "outcomeLibrary" || target === "stakeAdapter")) {
            const prepared = await this.blueprintStakeWorkflow.prepare(source, {outcomeLibraryGeneration: options.outcomeLibraryGeneration});
            const generation = prepared.generation.sampled;
            const configurationProvenance: ArtifactConfigurationProvenance = {
                configurationHash: prepared.configHash,
                pokieVersion: prepared.compatibility.pokieVersion,
                gameId: prepared.compatibility.gameId,
                gameVersion: prepared.compatibility.gameVersion,
                manifestIdentity: `${prepared.compatibility.gameId}@${prepared.compatibility.gameVersion}`,
                generationSemantics: generation === undefined ? "exact" : "boundedSample",
                ...(generation === undefined ? {} : {sampleCount: generation.sampleSize.toString(), sampleSeed: generation.seed}),
            };
            plannedSource = {...source, configurationProvenance};
            // Both public consumers of a managed Outcome Library inspect the
            // same registered candidate before planning.  This makes an
            // Outcome preview/build and its Stake prerequisite agree on the
            // selected reuse/materialization step.
            const inspection = await this.inspectManagedOutcome(source.rootPath, prepared.compatibility);
            if (inspection.project !== undefined) {
                managedOutcome = {identity: resolveArtifactIdentity(inspection.project), verified: true};
            } else if (inspection.staleReason !== undefined) {
                managedOutcome = {
                    identity: {kind: "outcomeLibrary", capabilities: []},
                    verified: false,
                    staleReason: inspection.staleReason,
                };
            }
            planningOptions = {
                ...options,
                managedOutcome,
                pokieVersion: prepared.compatibility.pokieVersion,
                generationSemantics: generation === undefined ? "exact" : "boundedSample",
                ...(generation === undefined ? {} : {sampleCount: generation.sampleSize, sampleSeed: generation.seed}),
            };
        }
        return this.applyDestinationPolicy(plannedSource, target, planningOptions, this.planner.plan(plannedSource, target, planningOptions));
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
        return this.planner.planType(source, target).status === "planned";
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
            assertPreparedArtifactDestinationAvailable(sourcePath, destinationPath, builder.destinationKind);
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
    public async validate(target: ArtifactTargetType, source: PokieProject, plan?: ArtifactConversionPlan): Promise<void> {
        const preparedPlan = plan ?? await this.preparePlan(source, target);
        this.assertExecutablePlan(preparedPlan);
        this.assertPlanTargetMatches(preparedPlan, target);
        await this.assertPlanSourceMatches(preparedPlan, source);
        this.assertTargetAvailable(target);

        if (source.type === "parWorkbook") {
            const blueprintBuilder = this.builders.get("blueprint");
            if (blueprintBuilder === undefined) throw new Error(this.unavailableTargetMessage("blueprint"));
            await blueprintBuilder.validate?.(source);
            return;
        }

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
    public async build(target: ArtifactTargetType, source: PokieProject, destinationPath: string, options?: ArtifactBuildOptions): Promise<ArtifactBuildResult> {
        const plan = await this.preparePlan(source, target, {destinationPath, outcomeLibraryGeneration: options?.outcomeLibraryGeneration});
        return this.executePlan(plan, source, destinationPath, options);
    }

    /** Execute only the steps selected by preparePlan; no lifecycle lookup re-decides reuse. */
    public async executePlan(plan: ArtifactConversionPlan, source: PokieProject, destinationPath: string, options?: ArtifactBuildOptions): Promise<ArtifactBuildResult> {
        // Preserve the public asynchronous execution boundary even for a
        // reuse-only plan, so adapters observe one lifecycle shape.
        await Promise.resolve();
        this.assertExecutablePlan(plan);
        this.assertTargetAvailable(plan.target.kind as ArtifactTargetType);
        await this.assertPlanSourceMatches(plan, source);
        this.assertPlanDestinationMatches(plan, destinationPath);
        await this.assertPlanGraphIsCurrent(plan, source, destinationPath);
        if (source.type === "parWorkbook") return this.executeParDerivedPlan(plan, source, destinationPath, options);
        return this.executeSelectedPlan(plan, source, destinationPath, options);
    }

    /** Executes already-selected stages without asking the planner to choose them again. */
    private async executeSelectedPlan(plan: ArtifactConversionPlan, source: PokieProject, destinationPath: string, options?: ArtifactBuildOptions): Promise<ArtifactBuildResult> {
        const target = plan.target.kind as ArtifactTargetType;
        const reuseStep = plan.steps.find((step) => step.kind === "reuseManagedOutcomeLibrary");
        const managed = reuseStep === undefined ? undefined : await this.reopenPlannedManagedOutcome(source, plan.source, reuseStep.output);
        // Every selected plan is subjected to the same destination policy at
        // execution.  In particular, reuse does not bypass a source alias or
        // existing-output conflict merely because no new outcomes are
        // generated.
        const destination = this.checkDestination(target, destinationPath, this.destinationSafetySource(plan, source));
        if (!destination.available) throw new ArtifactBuildConflictError(destination.message ?? "The destination is unavailable.");
        if (target === "outcomeLibrary" && managed !== undefined) {
            const builder = this.builders.get("outcomeLibrary");
            if (builder === undefined) throw new Error(this.unavailableTargetMessage("outcomeLibrary"));
            const result = await builder.build(managed, destinationPath, options);
            let published: PokieProject;
            try {
                published = await this.registerPublishedManagedOutcome(source, plan.source, destinationPath);
            } catch (error) {
                // A republished bundle is not a managed artifact unless its
                // registry publication succeeds.  Keep the same rollback
                // policy as generation rather than leaving a plausible,
                // unregistered output behind.
                await fs.promises.rm(destinationPath, {recursive: true, force: true}).catch(() => undefined);
                throw error;
            }
            return {
                ...result,
                reusedCompatibleProject: true,
                requestedDestinationPath: destinationPath,
                managedProjectRoots: [published.rootPath],
                // Republishing a reused library creates a *new* managed
                // record at destinationPath.  The source library remains
                // borrowed, but this publication must be released if a later
                // Studio registration boundary fails.
                managedOutcomeProjectOwnership: [{
                    rootPath: published.rootPath,
                    sourceRootPath: source.rootPath,
                    disposition: "owned",
                }],
            };
        }
        if (plan.steps.some((step) => step.kind === "generateOutcomeLibrary") && target === "outcomeLibrary") {
            return this.buildManagedOutcomeFromRuntime(plan, source, destinationPath, options);
        }
        if (target === "stakeAdapter" && (managed !== undefined || plan.steps.some((step) => step.kind === "generateOutcomeLibrary"))) {
            return this.buildStakeFromPlannedOutcome(plan, source, destinationPath, options, managed);
        }
        const builder = this.builders.get(target);
        if (builder === undefined) throw new Error(this.unavailableTargetMessage(target));
        return builder.build(source, destinationPath, options);
    }

    /**
     * PAR is the one exchange source that can canonically import a game model.
     * Materialize that model once into a plan-owned intermediate, then hand the
     * selected downstream stages to the existing Blueprint lifecycle.
     */
    private async executeParDerivedPlan(plan: ArtifactConversionPlan, source: PokieProject, destinationPath: string, options?: ArtifactBuildOptions): Promise<ArtifactBuildResult> {
        const target = plan.target.kind as ArtifactTargetType;
        const destination = this.checkDestination(target, destinationPath, source.rootPath);
        if (!destination.available) throw new ArtifactBuildConflictError(destination.message ?? "The destination is unavailable.");
        if (target === "blueprint" || target === "parWorkbook") {
            const builder = this.builders.get(target);
            if (builder === undefined) throw new Error(this.unavailableTargetMessage(target));
            return builder.build(source, destinationPath, options);
        }
        const intermediateDirectory = await fs.promises.mkdtemp(path.join(path.dirname(destinationPath), ".pokie-par-import-"));
        const intermediatePath = path.join(intermediateDirectory, "imported.blueprint.json");
        let imported: PokieProject | undefined;
        let selectedPlan: ArtifactConversionPlan | undefined;
        let result: ArtifactBuildResult | undefined;
        try {
            assertArtifactBuildNotCancelled(options);
            const blueprintBuilder = this.builders.get("blueprint");
            if (blueprintBuilder === undefined) throw new Error(this.unavailableTargetMessage("blueprint"));
            await blueprintBuilder.build(source, intermediatePath, options);
            imported = {
                type: "blueprint",
                rootPath: intermediatePath,
                provenance: `imported from PAR workbook ${source.rootPath}`,
                capabilities: PROJECT_TYPE_CAPABILITIES.blueprint,
            };
            // The PAR plan chose every downstream stage before import began.
            // Hydrate its imported-Blueprint identity with the materialized
            // runtime provenance, then execute those selected stages directly;
            // calling build() here would silently prepare a second plan.
            selectedPlan = await this.hydrateParDerivedPlan(plan, imported, options);
            result = await this.executeSelectedPlan(selectedPlan, imported, destinationPath, options);
            // The temporary Blueprint is only an execution allocation.  Once
            // the selected terminal writer succeeds, retain an inspectable
            // copy and its evidence under the final artifact instead of
            // leaking a private temp path into provenance.
            const evidenceSource = `${intermediatePath}.conversion-evidence.json`;
            const durableDirectory = path.join(result.outputPath, ".pokie", "par-import");
            const durableBlueprint = path.join(durableDirectory, "imported.blueprint.json");
            const durableEvidence = path.join(durableDirectory, "conversion-evidence.json");
            try {
                // Cancellation is a terminal lifecycle failure too: do not
                // attach a half-copied provenance record after the caller has
                // cancelled the operation.
                assertArtifactBuildNotCancelled(options);
                await fs.promises.mkdir(durableDirectory, {recursive: true});
                await fs.promises.copyFile(intermediatePath, durableBlueprint);
                assertArtifactBuildNotCancelled(options);
                await fs.promises.copyFile(evidenceSource, durableEvidence);
                assertArtifactBuildNotCancelled(options);
            } catch (error) {
                // Publication, generated managed prerequisites, and durable
                // attachment are one operation.  Remove only roots selected
                // for materialization by this plan; a reused managed Outcome
                // belongs to an earlier operation and must survive.
                await this.rollbackParDerivedPublication(result, imported, selectedPlan);
                throw error;
            }
            result = await this.promoteParManagedOutcomes(result, imported, durableBlueprint, selectedPlan, durableDirectory);
            return {...result, conversionEvidencePath: durableEvidence, importedBlueprintPath: durableBlueprint};
        } finally {
            // Outcome streaming can finish its final writer callback while the
            // caller unwinds. Retry ENOTEMPTY rather than turning a completed
            // terminal publication into an intermediate-cleanup failure.
            await fs.promises.rm(intermediateDirectory, {recursive: true, force: true, maxRetries: 8, retryDelay: 25});
        }
    }

    private async rollbackParDerivedPublication(result: ArtifactBuildResult, imported: PokieProject, plan: ArtifactConversionPlan): Promise<void> {
        const ownership = this.managedOutcomeOwnership(result, plan, imported.rootPath);
        for (const entry of ownership) {
            if (entry.disposition !== "owned") continue;
            await this.managedOutcomeProjects.release(entry.sourceRootPath, entry.rootPath).catch(() => undefined);
            if (entry.rootPath !== result.outputPath) await fs.promises.rm(entry.rootPath, {recursive: true, force: true}).catch(() => undefined);
        }
        await fs.promises.rm(result.outputPath, {recursive: true, force: true}).catch(() => undefined);
    }

    /**
     * A PAR import starts in a private directory so an invalid workbook never
     * becomes visible.  Once its terminal publication succeeds, promote any
     * generated Outcome prerequisite to the durable imported-Blueprint tree.
     * This keeps both managed and Studio registries away from the directory
     * removed by executeParDerivedPlan's finally block.
     */
    private async promoteParManagedOutcomes(
        result: ArtifactBuildResult,
        imported: PokieProject,
        durableBlueprintPath: string,
        plan: ArtifactConversionPlan,
        durableDirectory: string,
    ): Promise<ArtifactBuildResult> {
        const ownership = this.managedOutcomeOwnership(result, plan, imported.rootPath);
        const owned = ownership.filter((entry) => entry.disposition === "owned");
        if (owned.length === 0) return result;

        const compatibility = this.compatibilityFromPlan(plan.source);
        const promoted = new Map<string, string>();
        for (const entry of owned) {
            const durableRoot = entry.rootPath === result.outputPath
                ? entry.rootPath
                : path.join(durableDirectory, "outcome-library");
            await this.managedOutcomeProjects.release(entry.sourceRootPath, entry.rootPath);
            if (durableRoot !== entry.rootPath) {
                await fs.promises.rm(durableRoot, {recursive: true, force: true});
                await fs.promises.rename(entry.rootPath, durableRoot);
            }
            await this.managedOutcomeProjects.registerAndOpen(durableBlueprintPath, durableRoot, compatibility);
            promoted.set(entry.rootPath, durableRoot);
        }
        const relocate = (root: string): string => promoted.get(root) ?? root;
        return {
            ...result,
            ...(result.prerequisiteProjectRoots === undefined ? {} : {prerequisiteProjectRoots: result.prerequisiteProjectRoots.map(relocate)}),
            ...(result.managedProjectRoots === undefined ? {} : {managedProjectRoots: result.managedProjectRoots.map(relocate)}),
            managedOutcomeProjectOwnership: ownership.map((entry) => entry.disposition !== "owned" ? entry : {
                ...entry,
                rootPath: relocate(entry.rootPath),
                sourceRootPath: durableBlueprintPath,
            }),
        };
    }

    private async hydrateParDerivedPlan(plan: ArtifactConversionPlan, imported: PokieProject, options?: ArtifactBuildOptions): Promise<ArtifactConversionPlan> {
        const importStep = plan.steps.find((step) => step.kind === "importParWorkbook");
        if (importStep === undefined) throw new Error("The prepared PAR conversion plan has no import stage.");
        let source: ArtifactIdentity = {...resolveArtifactIdentity(imported), recognitionProvenance: importStep.output.recognitionProvenance};
        if (plan.target.kind === "outcomeLibrary" || plan.target.kind === "stakeAdapter") {
            const prepared = await this.blueprintStakeWorkflow.prepare(imported, {outcomeLibraryGeneration: options?.outcomeLibraryGeneration});
            const sampled = prepared.generation.sampled;
            source = {
                ...source,
                configurationProvenance: {
                    configurationHash: prepared.configHash,
                    pokieVersion: prepared.compatibility.pokieVersion,
                    gameId: prepared.compatibility.gameId,
                    gameVersion: prepared.compatibility.gameVersion,
                    manifestIdentity: `${prepared.compatibility.gameId}@${prepared.compatibility.gameVersion}`,
                    generationSemantics: sampled === undefined ? "exact" : "boundedSample",
                    ...(sampled === undefined ? {} : {sampleCount: sampled.sampleSize.toString(), sampleSeed: sampled.seed}),
                },
            };
        }
        return {...plan, source, steps: plan.steps.filter((step) => step !== importStep)};
    }

    private async buildStakeFromPlannedOutcome(plan: ArtifactConversionPlan, source: PokieProject, destinationPath: string, options: ArtifactBuildOptions | undefined, reused?: PokieProject): Promise<ArtifactBuildResult> {
        // A materialized prerequisite is planner-owned only until the final
        // Stake publication succeeds.  A reused managed library predates this
        // plan and must survive a failed/cancelled publication unchanged.
        const generated = reused === undefined ? await this.generatePlannedManagedOutcome(plan, source, options) : undefined;
        const outcomeLibrary = reused ?? generated!.project;
        const builder = this.builders.get("stakeAdapter");
        if (builder === undefined) throw new Error(this.unavailableTargetMessage("stakeAdapter"));
        try {
            const result = await builder.build(outcomeLibrary, destinationPath, options);
            return {
                ...result,
                prerequisiteProjectRoots: [outcomeLibrary.rootPath],
                managedProjectRoots: [outcomeLibrary.rootPath],
                managedOutcomeProjectOwnership: [{
                    rootPath: outcomeLibrary.rootPath,
                    sourceRootPath: source.rootPath,
                    disposition: generated === undefined ? "borrowed" : "owned",
                }],
            };
        } catch (error) {
            if (generated !== undefined) {
                // generatePrepared registered this intermediate so later plans
                // could safely reuse it.  That registration is not valid when
                // the selected plan's terminal publication failed: release the
                // record before deleting only this planner-owned root.
                await this.managedOutcomeProjects.release(source.rootPath, outcomeLibrary.rootPath).catch(() => undefined);
                await fs.promises.rm(outcomeLibrary.rootPath, {recursive: true, force: true}).catch(() => undefined);
            }
            throw error;
        }
    }

    /**
     * Reopens exactly the persisted candidate named by a public plan.  The
     * plan carries its canonical location and provenance, so execution does
     * not depend on process-local object identity (and cannot select a
     * different managed bundle if the registry changes between preview and
     * execution).
     */
    private async reopenPlannedManagedOutcome(source: PokieProject, sourceIdentity: ArtifactIdentity, plannedIdentity: ArtifactIdentity): Promise<PokieProject> {
        const provenance = sourceIdentity.configurationProvenance;
        if (provenance?.configurationHash === undefined || provenance.gameId === undefined || provenance.gameVersion === undefined || provenance.pokieVersion === undefined) {
            throw new Error("The selected managed Outcome Library plan has no complete provenance; prepare a new plan before executing it.");
        }
        const generation = provenance.generationSemantics === "boundedSample"
            ? `sample:${provenance.sampleCount ?? ""}:${provenance.sampleSeed ?? ""}`
            : "exact";
        const inspection = await this.inspectManagedOutcome(source.rootPath, {
            configHash: provenance.configurationHash,
            gameId: provenance.gameId,
            gameVersion: provenance.gameVersion,
            pokieVersion: provenance.pokieVersion,
            generation,
        });
        if (inspection.project === undefined || plannedIdentity.canonicalLocation === undefined ||
            resolveArtifactIdentity(inspection.project).canonicalLocation !== plannedIdentity.canonicalLocation) {
            throw new Error("The selected managed Outcome Library is no longer available or no longer matches the prepared plan; prepare a new plan before executing it.");
        }
        return inspection.project;
    }

    private registerPublishedManagedOutcome(source: PokieProject, sourceIdentity: ArtifactIdentity, destinationPath: string): Promise<PokieProject> {
        const provenance = sourceIdentity.configurationProvenance;
        if (provenance?.configurationHash === undefined || provenance.gameId === undefined || provenance.gameVersion === undefined || provenance.pokieVersion === undefined) {
            throw new Error("The selected managed Outcome Library plan has no complete provenance; cannot register its publication.");
        }
        return this.managedOutcomeProjects.registerAndOpen(source.rootPath, destinationPath, {
            configHash: provenance.configurationHash,
            gameId: provenance.gameId,
            gameVersion: provenance.gameVersion,
            pokieVersion: provenance.pokieVersion,
            generation: provenance.generationSemantics === "boundedSample"
                ? `sample:${provenance.sampleCount ?? ""}:${provenance.sampleSeed ?? ""}`
                : "exact",
        });
    }

    private assertExecutablePlan(plan: ArtifactConversionPlan): void {
        if (plan.status === "planned") return;
        const diagnostic = plan.diagnostic;
        if (diagnostic === undefined) throw new Error("Artifact conversion could not be planned.");
        const compatibility = describeArtifactConversionPlanDiagnostic(plan);
        throw new Error(`${diagnostic.message} Next: ${diagnostic.recovery}${compatibility === undefined ? "" : `\n${compatibility}`}`);
    }

    private async buildManagedOutcomeFromRuntime(
        plan: ArtifactConversionPlan,
        source: PokieProject,
        destinationPath: string,
        options?: ArtifactBuildOptions,
    ): Promise<ArtifactBuildResult> {
        // A requested --out is a real destination contract, even when a compatible managed Outcome
        // Project already exists.  Check it before the managed-project lookup: otherwise the lookup
        // turns an explicit destination into a silently ignored hint (and can bypass the normal
        // no-overwrite policy every other artifact target enforces).
        // executePlan has already applied the destination policy from this
        // exact prepared plan.  Do not re-derive the ordinary source-root
        // rule here: a tsPackage's canonical outcomelibrary sidecar is an
        // intentional, planner-approved generated child of that package.
        const outcomeLibrary = await this.generatePlannedManagedOutcome(plan, source, options, destinationPath);
        return {
            outputPath: outcomeLibrary.project.rootPath,
            ...(outcomeLibrary.reused
                ? {requestedDestinationPath: destinationPath, reusedCompatibleProject: true}
                : {}),
            managedProjectRoots: [outcomeLibrary.project.rootPath],
            managedOutcomeProjectOwnership: [{
                rootPath: outcomeLibrary.project.rootPath,
                sourceRootPath: source.rootPath,
                disposition: "owned",
            }],
        };
    }

    private managedOutcomeOwnership(
        result: ArtifactBuildResult,
        plan: ArtifactConversionPlan,
        fallbackSourceRootPath: string,
    ): readonly ManagedOutcomeProjectOwnership[] {
        if (result.managedOutcomeProjectOwnership !== undefined) return result.managedOutcomeProjectOwnership;
        // Compatibility for injected legacy registries in extension tests.
        // Production results always carry per-root ownership.
        const reuses = plan.steps.some((step) => step.kind === "reuseManagedOutcomeLibrary");
        return Array.from(new Set([...(result.prerequisiteProjectRoots ?? []), ...(result.managedProjectRoots ?? [])])).map((rootPath) => ({
            rootPath,
            sourceRootPath: fallbackSourceRootPath,
            disposition: reuses ? "borrowed" : "owned",
        }));
    }

    private async generatePlannedManagedOutcome(
        plan: ArtifactConversionPlan,
        source: PokieProject,
        options?: ArtifactBuildOptions,
        destinationPath?: string,
    ): Promise<{readonly project: PokieProject; readonly reused: false}> {
        const expected = this.compatibilityFromPlan(plan.source);
        const lifecycleOptions = this.optionsForPlan(options, plan.source);
        // Refresh the actual source before materialization and reject drift
        // rather than generating from a different configuration under an old
        // preview's identity.
        const prepared = await this.blueprintStakeWorkflow.prepare(source, lifecycleOptions);
        if (!this.sameCompatibility(prepared.compatibility, expected)) {
            throw new Error("The recognized source changed after this conversion was prepared; prepare a new plan before executing it.");
        }
        const root = destinationPath ?? this.managedOutcomeProjects.allocateRoot(source.rootPath, expected);
        return this.blueprintStakeWorkflow.generatePrepared(
            source,
            prepared,
            root,
            lifecycleOptions,
            this.destinationSafetySource(plan, source) === undefined,
        );
    }

    private optionsForPlan(options: ArtifactBuildOptions | undefined, source: ArtifactIdentity): ArtifactBuildOptions | undefined {
        const provenance = source.configurationProvenance;
        if (provenance?.generationSemantics === undefined) return options;
        const outcomeLibraryGeneration = provenance.generationSemantics === "exact"
            ? {exact: true as const}
            : {
                sampled: {
                    sampleSize: BigInt(provenance.sampleCount ?? "0"),
                    seed: provenance.sampleSeed ?? "",
                },
            };
        return {...options, outcomeLibraryGeneration};
    }

    private compatibilityFromPlan(source: ArtifactIdentity): import("./ManagedOutcomeProjectService.js").OutcomeProjectCompatibility {
        const provenance = source.configurationProvenance;
        if (provenance?.configurationHash === undefined || provenance.gameId === undefined || provenance.gameVersion === undefined || provenance.pokieVersion === undefined) {
            throw new Error("The selected conversion plan has no complete source provenance; prepare a new plan before executing it.");
        }
        return {
            configHash: provenance.configurationHash,
            gameId: provenance.gameId,
            gameVersion: provenance.gameVersion,
            pokieVersion: provenance.pokieVersion,
            generation: provenance.generationSemantics === "boundedSample" ? `sample:${provenance.sampleCount ?? ""}:${provenance.sampleSeed ?? ""}` : "exact",
        };
    }

    private sameCompatibility(left: import("./ManagedOutcomeProjectService.js").OutcomeProjectCompatibility, right: import("./ManagedOutcomeProjectService.js").OutcomeProjectCompatibility): boolean {
        return left.configHash === right.configHash && left.gameId === right.gameId && left.gameVersion === right.gameVersion && left.pokieVersion === right.pokieVersion && (left.generation ?? "exact") === (right.generation ?? "exact");
    }

    private async assertPlanSourceMatches(plan: ArtifactConversionPlan, source: PokieProject): Promise<void> {
        const current = resolveArtifactIdentity(source);
        if (current.kind !== plan.source.kind || current.canonicalLocation !== plan.source.canonicalLocation ||
            current.recognitionProvenance !== plan.source.recognitionProvenance ||
            current.capabilities.join("\u0000") !== plan.source.capabilities.join("\u0000")) {
            throw new Error("The source identity changed after this conversion was prepared; prepare a new plan before executing it.");
        }
        // PAR projects are resolved from a workbook byte binding.  `source` is
        // intentionally a small immutable-looking DTO, so its binding hash is
        // the value observed by the resolver at preflight time and cannot be
        // trusted after a user replaces the workbook.  Re-read it here before
        // any import or dependent writer gets a chance to publish.
        if (source.type === "parWorkbook") {
            const preparedHash = plan.source.configurationProvenance?.configurationHash;
            const currentHash = computeArtifactInputBindingHash([source.rootPath]);
            if (preparedHash === undefined || preparedHash !== currentHash) {
                throw new Error("The PAR workbook changed after this conversion was prepared; prepare a new plan before executing it.");
            }
        }
        // Resolved Blueprint/package provenance is computed from the runnable
        // source, rather than copied from the project wrapper. Re-prepare it
        // at the execution boundary so a config or generation change cannot
        // reuse a previously selected managed candidate.
        if (plan.source.configurationProvenance !== undefined) {
            const refreshed = await this.preparePlan(source, plan.target.kind as ArtifactTargetType, {
                destinationPath: plan.target.canonicalLocation,
                // Refresh with the exact generation request that created the
                // prepared plan.  Planning options' presentation fields are
                // not consumed by BlueprintStakeOutcomeLibraryWorkflow;
                // outcomeLibraryGeneration is the executable input.
                outcomeLibraryGeneration: this.optionsForPlan(undefined, plan.source)?.outcomeLibraryGeneration,
            });
            if (!sameConfigurationProvenance(plan.source.configurationProvenance, refreshed.source.configurationProvenance)) {
                throw new Error("The source configuration or generation provenance changed after this conversion was prepared; prepare a new plan before executing it.");
            }
        }
    }

    /**
     * A prepared plan is a serializable public value, not a caller-authorized
     * graph.  Rebuild the current graph at the execution boundary and require
     * the supplied steps, reuse selection, diagnostics and output identity to
     * be precisely the planner's result.  This rejects hand-built/deserialized
     * graphs which try to skip an unavailable edge or change a prerequisite.
     */
    private async assertPlanGraphIsCurrent(plan: ArtifactConversionPlan, source: PokieProject, destinationPath: string): Promise<void> {
        const target = plan.target.kind as ArtifactTargetType;
        const current = await this.preparePlan(source, target, {
            destinationPath,
            outcomeLibraryGeneration: this.optionsForPlan(undefined, plan.source)?.outcomeLibraryGeneration,
        });
        if (JSON.stringify(current) !== JSON.stringify(plan)) {
            throw new Error("The prepared conversion graph is stale or invalid; prepare a new plan before executing it.");
        }
    }

    private assertPlanTargetMatches(plan: ArtifactConversionPlan, target: ArtifactTargetType): void {
        if (plan.target.kind !== target) {
            throw new Error("The requested target does not match this prepared conversion plan; prepare a new plan before validating it.");
        }
    }

    private assertPlanDestinationMatches(plan: ArtifactConversionPlan, destinationPath: string): void {
        if (plan.target.canonicalLocation === undefined || path.resolve(destinationPath) !== plan.target.canonicalLocation) {
            throw new Error("The destination changed after this conversion was prepared; prepare a new plan before executing it.");
        }
    }

    private async inspectManagedOutcome(sourceRootPath: string, compatibility: import("./ManagedOutcomeProjectService.js").OutcomeProjectCompatibility): Promise<{readonly project?: PokieProject; readonly staleReason?: string}> {
        const service = this.managedOutcomeProjects as ManagedOutcomeProjectServicing & {
            inspect?: (sourceRootPath: string, compatibility: import("./ManagedOutcomeProjectService.js").OutcomeProjectCompatibility) => Promise<{readonly project?: PokieProject; readonly staleReason?: string}>;
        };
        if (service.inspect !== undefined) return service.inspect(sourceRootPath, compatibility);
        const project = await service.findCompatible(sourceRootPath, compatibility);
        return project === undefined ? {} : {project};
    }

    private applyDestinationPolicy(source: PokieProject, target: ArtifactTargetType, options: ArtifactConversionPlanningOptions, plan: ArtifactConversionPlan): ArtifactConversionPlan {
        if (plan.status !== "planned" || options.destinationPath === undefined) return plan;
        // A runnable package's conventional managed Outcome Library lives at
        // `<package>/outcomelibrary`. It is a generated sidecar, not a
        // replacement for the package input, and Studio's server-owned
        // generation lifecycle has always published there. Keep every other
        // descendant blocked (including aliases), while retaining normal
        // occupied-destination checks for this one canonical managed output.
        const destination = this.checkDestination(target, options.destinationPath, this.destinationSafetySource(plan, source));
        if (destination.available) return plan;
        return {
            ...plan,
            status: "conflict",
            diagnostic: {
                code: "destination-conflict",
                failedEdge: {from: source.type, to: target},
                message: destination.message ?? "The destination is unavailable.",
                recovery: "Choose an empty destination that is not the source or one of its descendants.",
            },
        };
    }

    /**
     * The planner owns the one supported descendant destination: the managed
     * Outcome sidecar of a runnable package.  Preparation, preview and
     * execution must use this exact rule so a successful preview cannot turn
     * into a source/descendant conflict when publishing.
     */
    private destinationSafetySource(plan: ArtifactConversionPlan, source: PokieProject): string | undefined {
        const isCanonicalPackageManagedOutcome =
            source.type === "tsPackage" &&
            plan.target.kind === "outcomeLibrary" &&
            plan.target.canonicalLocation === path.join(path.resolve(source.rootPath), "outcomelibrary");
        return isCanonicalPackageManagedOutcome ? undefined : source.rootPath;
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
