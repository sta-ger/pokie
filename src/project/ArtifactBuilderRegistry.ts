import type {ArtifactBuilder} from "./ArtifactBuilder.js";
import fs from "fs";
import path from "path";
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
import {ArtifactConversionPlanner, describeArtifactConversionPlanDiagnostic, resolveArtifactIdentity, type ArtifactConfigurationProvenance, type ArtifactConversionPlan, type ArtifactConversionPlanningOptions, type ArtifactIdentity} from "./ArtifactConversionPlanner.js";
import {
    ADVERTISED_ARTIFACT_BUILD_TARGETS,
    BUILD_PRODUCT_MATRIX_SOURCE_TYPES,
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
    public async validate(target: ArtifactTargetType, source: PokieProject, plan?: ArtifactConversionPlan): Promise<void> {
        const preparedPlan = plan ?? await this.preparePlan(source, target);
        this.assertExecutablePlan(preparedPlan);
        this.assertPlanSourceMatches(preparedPlan, source);
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
        const target = plan.target.kind as ArtifactTargetType;
        this.assertPlanSourceMatches(plan, source);
        this.assertPlanDestinationMatches(plan, destinationPath);
        const reuseStep = plan.steps.find((step) => step.kind === "reuseManagedOutcomeLibrary");
        const managed = reuseStep === undefined ? undefined : await this.reopenPlannedManagedOutcome(source, plan.source, reuseStep.output);
        // Every selected plan is subjected to the same destination policy at
        // execution.  In particular, reuse does not bypass a source alias or
        // existing-output conflict merely because no new outcomes are
        // generated.
        const destination = this.checkDestination(target, destinationPath, source.rootPath);
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

    private async buildStakeFromPlannedOutcome(plan: ArtifactConversionPlan, source: PokieProject, destinationPath: string, options: ArtifactBuildOptions | undefined, reused?: PokieProject): Promise<ArtifactBuildResult> {
        const outcomeLibrary = reused ?? (await this.generatePlannedManagedOutcome(plan, source, options)).project;
        const builder = this.builders.get("stakeAdapter");
        if (builder === undefined) throw new Error(this.unavailableTargetMessage("stakeAdapter"));
        const result = await builder.build(outcomeLibrary, destinationPath, options);
        return {
            ...result,
            prerequisiteProjectRoots: [outcomeLibrary.rootPath],
            managedProjectRoots: [outcomeLibrary.rootPath],
        };
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
        assertArtifactDestinationAvailable(destinationPath, "directory");
        assertArtifactDestinationIsSafe(source.rootPath, destinationPath);
        const outcomeLibrary = await this.generatePlannedManagedOutcome(plan, source, options, destinationPath);
        return {
            outputPath: outcomeLibrary.project.rootPath,
            ...(outcomeLibrary.reused
                ? {requestedDestinationPath: destinationPath, reusedCompatibleProject: true}
                : {}),
            managedProjectRoots: [outcomeLibrary.project.rootPath],
        };
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
        return this.blueprintStakeWorkflow.generatePrepared(source, prepared, root, lifecycleOptions);
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

    private assertPlanSourceMatches(plan: ArtifactConversionPlan, source: PokieProject): void {
        const current = resolveArtifactIdentity(source);
        if (current.kind !== plan.source.kind || current.canonicalLocation !== plan.source.canonicalLocation ||
            current.recognitionProvenance !== plan.source.recognitionProvenance ||
            current.capabilities.join("\u0000") !== plan.source.capabilities.join("\u0000")) {
            throw new Error("The source identity changed after this conversion was prepared; prepare a new plan before executing it.");
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
        const destination = this.checkDestination(target, options.destinationPath, source.rootPath);
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
