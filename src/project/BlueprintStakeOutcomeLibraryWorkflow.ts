import fs from "fs";
import vm from "vm";
import type {GameBlueprint} from "../generated/GameBlueprint.js";
import {GameBlueprintValidator} from "../generated/GameBlueprintValidator.js";
import {materializeReelStrips} from "../generated/materializeReelStrips.js";
import {renderBuiltGameModule} from "../generated/renderBuiltGameModule.js";
import {resolveReelStripGeneration} from "../generated/resolveReelStripGeneration.js";
import {computeGameBlueprintHash} from "../generated/computeGameBlueprintHash.js";
import type {PokieGame} from "../gamepackage/PokieGame.js";
import {loadPokieGame} from "../gamepackage/loadPokieGame.js";
import {VideoSlotSessionSerializer} from "../net/videoslot/VideoSlotSessionSerializer.js";
import {CustomLinesDefinitions} from "../session/videoslot/linesdefinitions/CustomLinesDefinitions.js";
import {ReelsSymbolsSequencesGenerator} from "../session/videoslot/combinations/ReelsSymbolsSequencesGenerator.js";
import {SeededRandomNumberGenerator} from "../session/videoslot/combinations/SeededRandomNumberGenerator.js";
import {SymbolsCombinationsGenerator} from "../session/videoslot/combinations/SymbolsCombinationsGenerator.js";
import {SymbolsSequence} from "../session/videoslot/combinations/SymbolsSequence.js";
import {VideoSlotConfig} from "../session/videoslot/VideoSlotConfig.js";
import {VideoSlotSession} from "../session/videoslot/VideoSlotSession.js";
import {VideoSlotWithFreeGamesConfig} from "../session/videoslot/VideoSlotWithFreeGamesConfig.js";
import {VideoSlotWithFreeGamesSession} from "../session/videoslot/VideoSlotWithFreeGamesSession.js";
import {BetModeDefinition} from "../session/videoslot/betmode/BetModeDefinition.js";
import {BetModesConfig} from "../session/videoslot/betmode/BetModesConfig.js";
import {FreeGamesForcedFeatureEntryHandler} from "../session/videoslot/betmode/FreeGamesForcedFeatureEntryHandler.js";
import {PerModeForcedFeatureEntryHandler} from "../session/videoslot/betmode/PerModeForcedFeatureEntryHandler.js";
import {VideoSlotWithBetModesSession} from "../session/videoslot/betmode/VideoSlotWithBetModesSession.js";
import {VideoSlotWinCalculator} from "../session/videoslot/wincalculator/VideoSlotWinCalculator.js";
import {WaysWinCalculator} from "../session/videoslot/wincalculator/WaysWinCalculator.js";
import {ClusterWinCalculator} from "../session/videoslot/wincalculator/ClusterWinCalculator.js";
import {SelectedEvaluatorGroupWinAggregationPolicy} from "../session/videoslot/winevaluation/SelectedEvaluatorGroupWinAggregationPolicy.js";
import {OutcomeLibraryBundleWriter} from "../weightedoutcome/bundle/OutcomeLibraryBundleWriter.js";
import type {OutcomeLibraryBundleWriting} from "../weightedoutcome/bundle/OutcomeLibraryBundleWriting.js";
import {generateWeightedOutcomeLibrary} from "../weightedoutcome/generate/generateExactWeightedOutcomeLibrary.js";
import {
    DEFAULT_MAX_EXACT_OUTCOME_SPACE_SIZE,
    MANAGED_OUTCOME_LIBRARY_GENERATION_COMPATIBILITY_POLICY,
    prepareOutcomeLibraryGeneration,
    type OutcomeLibraryGenerationDestinationSafety,
    type OutcomeLibraryGenerationPreflight,
} from "../weightedoutcome/generate/OutcomeLibraryGenerationRequest.js";
import {estimateExactOutcomeSpaceSize} from "../weightedoutcome/generate/estimateExactOutcomeSpaceSize.js";
import type {PokieProject} from "./PokieProject.js";
import {ManagedOutcomeProjectService, type ManagedOutcomeProjectServicing, type OutcomeProjectCompatibility} from "./ManagedOutcomeProjectService.js";
import {
    assertArtifactBuildNotCancelled,
    ArtifactBuildCancelledError,
    reportArtifactBuildProgress,
    type ArtifactBuildOptions,
    type ArtifactBuildPreflight,
} from "./ArtifactBuildOptions.js";

// A generated round artifact is materially larger than the raw reel-stop tuple which produced it. The
// generic exact-generator cap protects a sweep with tens of millions of tuples, but it cannot make a
// hundreds-of-thousands-entry artifact library fit in a normal CLI heap. Managed Blueprint/package exports
// therefore use a deterministic, explicitly recorded coverage sample above this planning limit unless the
// caller asks for exact generation.
// Compatibility aliases retained for direct callers.  The policy itself is
// domain-owned and versioned in OutcomeLibraryGenerationRequest.ts.
export const DEFAULT_MANAGED_EXACT_OUTCOME_SPACE_SIZE = MANAGED_OUTCOME_LIBRARY_GENERATION_COMPATIBILITY_POLICY.maxExactOutcomeSpaceSize;
export const DEFAULT_MANAGED_SAMPLED_OUTCOME_COUNT = MANAGED_OUTCOME_LIBRARY_GENERATION_COMPATIBILITY_POLICY.sampledOutcomeCount;

export type ManagedOutcomeGeneration = {
    // This is an explicitly-versioned compatibility policy for managed Project
    // conversion.  It is translated into the same domain request used by CLI
    // and Studio; it never changes the generator's global default cap.
    readonly generation: "exact" | "sampled";
    readonly sampled?: {readonly sampleSize: bigint; readonly seed: string};
    /**
     * The exact-space boundary used by the policy which resolved this request.
     * It is carried into the domain preflight and generator request rather than
     * being a workflow-only decision which cannot be reconstructed later.
     */
    readonly maxExactOutcomeSpaceSize?: bigint;
    /** Present only when the managed automatic compatibility policy chose this request. */
    readonly compatibilityPolicyVersion?: string;
};

const GENERATED_RUNTIME = {
    BetModeDefinition,
    BetModesConfig,
    ClusterWinCalculator,
    computeGameBlueprintHash,
    CustomLinesDefinitions,
    FreeGamesForcedFeatureEntryHandler,
    PerModeForcedFeatureEntryHandler,
    ReelsSymbolsSequencesGenerator,
    SeededRandomNumberGenerator,
    SelectedEvaluatorGroupWinAggregationPolicy,
    SymbolsCombinationsGenerator,
    SymbolsSequence,
    VideoSlotConfig,
    VideoSlotSession,
    VideoSlotSessionSerializer,
    VideoSlotWinCalculator,
    VideoSlotWithBetModesSession,
    VideoSlotWithFreeGamesConfig,
    VideoSlotWithFreeGamesSession,
    WaysWinCalculator,
};

// Registry-owned prerequisite preparation for a Blueprint/tsPackage -> Stake request. It drives the same
// executable runtime a package exposes through the public exact generator and canonical bundle writer; there
// is consequently no second, hand-written calculation or Stake export path hidden in a CLI/Studio caller.
export class BlueprintStakeOutcomeLibraryWorkflow {
    private readonly validator = new GameBlueprintValidator();
    private readonly pokieVersion: string;
    private readonly loadBlueprint: (filePath: string) => unknown;
    private readonly loadGame: typeof loadPokieGame;
    private readonly managedOutcomeProjects: ManagedOutcomeProjectServicing;
    private readonly writer: OutcomeLibraryBundleWriting;

    constructor(
        pokieVersion: string,
        loadBlueprint: (filePath: string) => unknown,
        loadGame: typeof loadPokieGame = loadPokieGame,
        managedOutcomeProjects: ManagedOutcomeProjectServicing = new ManagedOutcomeProjectService(),
        writer: OutcomeLibraryBundleWriting = new OutcomeLibraryBundleWriter(pokieVersion),
    ) {
        this.pokieVersion = pokieVersion;
        this.loadBlueprint = loadBlueprint;
        this.loadGame = loadGame;
        this.managedOutcomeProjects = managedOutcomeProjects;
        this.writer = writer;
    }

    // Plans/reuses an authoritative managed Outcome Project. This is the only Blueprint -> Outcome writer:
    // validate/materialize, exact generation, bundle verification and registration/reopen stay in this one
    // lifecycle for both direct Blueprint -> Outcome and Blueprint -> Stake requests.
    public async resolveOrGenerate(
        source: PokieProject,
        destinationPath: string | ((compatibility: OutcomeProjectCompatibility) => string),
        options?: ArtifactBuildOptions,
        reuseCompatible = true,
    ): Promise<{readonly project: PokieProject; readonly reused: boolean}> {
        assertArtifactBuildNotCancelled(options);
        const prepared = await this.prepare(source, options);
        const {compatibility} = prepared;
        if (reuseCompatible) {
            const compatible = await this.managedOutcomeProjects.findCompatible(source.rootPath, compatibility);
            if (compatible !== undefined) {
                reportArtifactBuildProgress(options, {status: "completed"});
                return {project: compatible, reused: true};
            }
        }

        const bundleDir = typeof destinationPath === "string" ? destinationPath : destinationPath(compatibility);
        return this.generatePrepared(source, prepared, bundleDir, options);
    }

    /**
     * Execute the generation route selected by a prepared conversion plan.
     * This intentionally performs no compatible-project lookup: reuse versus
     * regeneration is the planner's decision, not a race-dependent second
     * decision during execution.
     */
    public async generatePrepared(
        source: PokieProject,
        prepared: Awaited<ReturnType<BlueprintStakeOutcomeLibraryWorkflow["prepare"]>>,
        bundleDir: string,
        options?: ArtifactBuildOptions,
        allowPlannedSourceSidecar = false,
    ): Promise<{readonly project: PokieProject; readonly reused: false}> {
        assertArtifactBuildNotCancelled(options);
        const {game, configHash, generation, compatibility} = prepared;
        // Preparation owns the loaded configuration assertion, selected
        // strategy, publication identity and destination safety.  The managed
        // planner only translates this resolved request to its generic view.
        const preparedRequest = prepareOutcomeLibraryGeneration({
            libraryId: game.getManifest().id,
            game,
            pokieVersion: this.pokieVersion,
            configHash,
            generation: generation.generation,
            ...(generation.maxExactOutcomeSpaceSize === undefined ? {} : {maxExactOutcomeSpaceSize: generation.maxExactOutcomeSpaceSize}),
            ...(generation.compatibilityPolicyVersion === undefined ? {} : {compatibilityPolicyVersion: generation.compatibilityPolicyVersion}),
            ...(generation.sampled === undefined ? {} : {sample: generation.sampled}),
            outputDestination: bundleDir,
            outputDestinationSafety: {
                sourcePath: source.rootPath,
                kind: "directory",
                requireAvailable: true,
                // Only ArtifactBuilderRegistry may authorize the package's
                // canonical managed Outcome sidecar.  That exception is
                // immutable request data, not a writer-local bypass.
                ...(allowPlannedSourceSidecar ? {allowWithinSource: true} : {}),
            },
        });
        const boundDestination = preparedRequest.preflight.destination?.path;
        if (boundDestination === undefined) throw new Error("Managed Outcome Library generation requires a bound output destination.");
        const preflight = outcomeGenerationPreflight(preparedRequest.preflight);
        reportArtifactBuildProgress(options, {status: "preflight", preflight});
        assertArtifactBuildNotCancelled(options);
        try {
            await this.generateBundle(
                source.rootPath,
                game,
                configHash,
                boundDestination,
                preparedRequest.outputDestinationSafety,
                options,
                preflight,
                generation,
            );
            assertArtifactBuildNotCancelled(options);
            // The prepared request owns the canonical publication identity.
            // Do not retain the caller's unnormalised spelling for registry
            // registration: that would make rollback and later reuse refer to
            // a different destination than the one the writer published.
            const project = await this.managedOutcomeProjects.registerAndOpen(source.rootPath, boundDestination, compatibility);
            reportArtifactBuildProgress(options, {
                status: "completed",
                completed: preflight.estimatedItemCount,
                total: preflight.estimatedItemCount,
                preflight,
            });
            return {project, reused: false};
        } catch (error) {
            // A generated bundle is not a managed Project until registerAndOpen commits the registry record.
            // Do not leave a complete-looking orphan behind when registry I/O or cancellation fails.
            await fs.promises.rm(boundDestination, {recursive: true, force: true}).catch(() => undefined);
            if (options?.signal?.aborted) {
                reportArtifactBuildProgress(options, {status: "cancelled", preflight});
                if (!(error instanceof ArtifactBuildCancelledError)) assertArtifactBuildNotCancelled(options);
            } else reportArtifactBuildProgress(options, {status: "failed", preflight});
            throw error;
        }
    }

    // Read-only half of the managed lifecycle.  The registry uses this before
    // planning so a preview carries the same exact/sampled compatibility key
    // that the later writer will consume.  It intentionally shares the real
    // validation/materialization path rather than guessing from CLI flags.
    public async prepare(source: PokieProject, options?: ArtifactBuildOptions): Promise<{
        readonly game: PokieGame;
        readonly configHash: string;
        readonly generation: ManagedOutcomeGeneration;
        readonly compatibility: OutcomeProjectCompatibility;
    }> {
        const game = source.type === "blueprint" ? this.loadMaterializedGame(this.validateAndMaterialize(source.rootPath)) : await this.loadGame(source.rootPath);
        const configHash = game.getConfigHash?.();
        if (configHash === undefined) {
            throw new Error(`Project "${source.rootPath}" did not materialize a configuration hash; cannot safely register its outcome library.`);
        }
        const generation = resolveManagedOutcomeGeneration(game, configHash, options?.outcomeLibraryGeneration);
        return {
            game,
            configHash,
            generation,
            compatibility: {
                gameId: game.getManifest().id,
                gameVersion: game.getManifest().version,
                configHash,
                pokieVersion: this.pokieVersion,
                generation: generation.sampled === undefined
                    ? "exact"
                    : `sample:${generation.sampled.sampleSize}:${generation.sampled.seed}`,
                ...(generation.maxExactOutcomeSpaceSize === undefined ? {} : {maxExactOutcomeSpaceSize: generation.maxExactOutcomeSpaceSize.toString()}),
                ...(generation.compatibilityPolicyVersion === undefined ? {} : {compatibilityPolicyVersion: generation.compatibilityPolicyVersion}),
            },
        };
    }

    private async generateBundle(
        blueprintPath: string,
        game: PokieGame,
        configHash: string,
        destinationPath: string,
        destinationSafety: OutcomeLibraryGenerationDestinationSafety | undefined,
        options: ArtifactBuildOptions | undefined,
        preflight: ArtifactBuildPreflight,
        generation: ManagedOutcomeGeneration,
    ): Promise<void> {
        // destinationPath is already the immutable publication identity bound
        // by generatePrepared's domain request. Every per-mode execution below
        // receives that same identity rather than resolving its own spelling.
        const boundDestination = destinationPath;
        const declaredModes = game.getBetModes?.();
        // getBetModes() deliberately exposes both the legacy declarative shape and the explicit runtime
        // contract.  Only the latter wraps createExactEnumerationSession() in
        // VideoSlotWithBetModesSession, so selecting a metadata-only mode would fail even for its
        // harmless base entry.  Keep those declared modes as separately-labelled library outputs, but
        // do not ask the unwrapped executable session to select one.
        const hasRuntimeBetModes = declaredModes !== undefined && declaredModes.length > 0 && declaredModes.every((mode) => mode.runtimeType !== undefined);
        // A package without the optional bet-mode contract still has the canonical base runtime.
        const modes = declaredModes && declaredModes.length > 0 ? declaredModes : [{id: "base"}];
        const generated = await Promise.all(
            modes.map(async (mode) => ({
                mode,
                generated: await generateWeightedOutcomeLibrary({
                    libraryId: `${game.getManifest().id}-${mode.id}`,
                    game,
                    pokieVersion: this.pokieVersion,
                    configHash,
                    ...(declaredModes && declaredModes.length > 0 ? {mode: mode.id} : {}),
                    selectBetMode: hasRuntimeBetModes,
                    generation: generation.generation,
                    ...(generation.maxExactOutcomeSpaceSize === undefined ? {} : {maxExactOutcomeSpaceSize: generation.maxExactOutcomeSpaceSize}),
                    ...(generation.compatibilityPolicyVersion === undefined ? {} : {compatibilityPolicyVersion: generation.compatibilityPolicyVersion}),
                    ...(generation.sampled !== undefined ? {sample: generation.sampled} : {}),
                    // Bind the managed writer's destination into the same
                    // resolved domain request used by CLI and Studio. The
                    // workflow still owns filesystem publication/rollback,
                    // while the request owns its destination identity.
                    outputDestination: boundDestination,
                    ...(destinationSafety === undefined ? {} : {outputDestinationSafety: destinationSafety}),
                    signal: options?.signal,
                    onProgress: (completed, total) => {
                        reportArtifactBuildProgress(options, {status: "running", completed, total, preflight});
                    },
                }),
            })),
        );
        assertArtifactBuildNotCancelled(options);
        const result = await this.writer.writeToDirectory(
            generated.map(({mode, generated: library}) => ({
                modeName: mode.id,
                libraryId: library.library.libraryId,
                schemaVersion: library.library.schemaVersion,
                outcomes: library.library.outcomes,
                generator: library.diagnostics,
            })),
            boundDestination,
            {
                signal: options?.signal,
                onProgress: (progress) => {
                    reportArtifactBuildProgress(options, {
                        status: "running",
                        completed: progress.completed,
                        total: preflight.estimatedItemCount,
                        preflight,
                        message: progress.message,
                    });
                },
            },
        );
        const errors = result.issues.filter((issue) => issue.severity === "error");
        if (errors.length > 0 || result.manifest === undefined) {
            throw new Error(`Could not build Outcome Library from Blueprint "${blueprintPath}": ${errors.map((issue) => issue.message).join("; ")}`);
        }
    }

    private validateAndMaterialize(blueprintPath: string): GameBlueprint {
        const blueprint = this.loadBlueprint(blueprintPath);
        const errors = this.validator.validate(blueprint).filter((issue) => issue.severity === "error");
        if (errors.length > 0) {
            throw new Error(`Blueprint "${blueprintPath}" has ${errors.length} error(s); fix it in Game Model and retry: ${errors.map((issue) => `${issue.code}: ${issue.message}`).join("; ")}`);
        }
        const resolution = resolveReelStripGeneration(blueprint as GameBlueprint);
        if (!resolution.success) {
            const diagnostics = resolution.reels
                .filter((reel) => !reel.success)
                .map((reel) => `reel ${reel.reelIndex}: ${(reel.diagnostics[reel.diagnostics.length - 1]?.violations ?? []).map((violation) => `${violation.constraintId}: ${violation.message}`).join(", ")}`)
                .join("; ");
            throw new Error(`Blueprint "${blueprintPath}" cannot generate its reels; fix it in Game Model and retry: ${diagnostics}`);
        }
        return materializeReelStrips(blueprint as GameBlueprint, resolution.reelStripGeneration);
    }

    private loadMaterializedGame(blueprint: GameBlueprint): PokieGame {
        const module = {exports: {}} as {exports: unknown};
        // The generated package contains only require("pokie") plus its generated module body.  Supplying
        // the live public runtime namespace executes exactly that generated artifact contract without a
        // caller having to install a throw-away node_modules tree solely to generate outcomes.
        vm.runInNewContext(renderBuiltGameModule(blueprint, this.pokieVersion), {
            require: (name: string) => {
                if (name !== "pokie") throw new Error(`Generated Blueprint requested unsupported module "${name}".`);
                return GENERATED_RUNTIME;
            },
            module,
            exports: module.exports,
        });
        return module.exports as PokieGame;
    }

}

function resolveManagedOutcomeGeneration(
    game: PokieGame,
    configHash: string,
    requested: ArtifactBuildOptions["outcomeLibraryGeneration"],
): ManagedOutcomeGeneration {
    // Explicit requests still need to retain the resolved cap in their
    // managed compatibility key.  Omitting it previously made a reconstructed
    // plan unable to distinguish the public default from a historical policy.
    if (requested?.sampled !== undefined) return {
        generation: "sampled",
        sampled: requested.sampled,
        maxExactOutcomeSpaceSize: requested.maxExactOutcomeSpaceSize ?? DEFAULT_MAX_EXACT_OUTCOME_SPACE_SIZE,
        ...(requested.compatibilityPolicyVersion === undefined ? {} : {compatibilityPolicyVersion: requested.compatibilityPolicyVersion}),
    };
    if (requested?.exact) return {
        generation: "exact",
        maxExactOutcomeSpaceSize: requested.maxExactOutcomeSpaceSize ?? DEFAULT_MAX_EXACT_OUTCOME_SPACE_SIZE,
        ...(requested.compatibilityPolicyVersion === undefined ? {} : {compatibilityPolicyVersion: requested.compatibilityPolicyVersion}),
    };

    const estimate = estimateExactOutcomeSpaceSize(game);
    if (estimate.totalOutcomeSpaceSize <= MANAGED_OUTCOME_LIBRARY_GENERATION_COMPATIBILITY_POLICY.maxExactOutcomeSpaceSize) {
        return {
            generation: "exact",
            maxExactOutcomeSpaceSize: MANAGED_OUTCOME_LIBRARY_GENERATION_COMPATIBILITY_POLICY.maxExactOutcomeSpaceSize,
            compatibilityPolicyVersion: MANAGED_OUTCOME_LIBRARY_GENERATION_COMPATIBILITY_POLICY.version,
        };
    }
    return {
        generation: "sampled",
        sampled: {
            sampleSize: MANAGED_OUTCOME_LIBRARY_GENERATION_COMPATIBILITY_POLICY.sampledOutcomeCount,
            // The configuration hash is stable for the same Blueprint/package, so this automatic
            // coverage library is reproducible without machine-local state.
            seed: `${MANAGED_OUTCOME_LIBRARY_GENERATION_COMPATIBILITY_POLICY.seedPrefix}${configHash}`,
        },
        maxExactOutcomeSpaceSize: MANAGED_OUTCOME_LIBRARY_GENERATION_COMPATIBILITY_POLICY.maxExactOutcomeSpaceSize,
        compatibilityPolicyVersion: MANAGED_OUTCOME_LIBRARY_GENERATION_COMPATIBILITY_POLICY.version,
    };
}

function outcomeGenerationPreflight(preflight: OutcomeLibraryGenerationPreflight): ArtifactBuildPreflight {
    const estimatedItemCount = preflight.expectedRawWork;
    return {
        estimatedItemCount,
        // A generated outcome record contains a round artifact, so this intentionally conservative estimate is
        // a planning signal only; the precise output size is unknown until grids have been deduplicated.
        estimatedBytes: estimatedItemCount * BigInt(1024),
        ...(estimatedItemCount > BigInt(10_000) || preflight.strategy === "bounded-coverage"
            ? {complexityWarning: preflight.strategy === "exact"
                ? `Exact generation will enumerate ${estimatedItemCount} reel-stop combinations.`
                : `Large source (${preflight.estimate.totalOutcomeSpaceSize} reel-stop combinations): using ${estimatedItemCount} deterministic bounded-coverage draws. Use an explicit exact build only when the full artifact library fits your memory and storage budget.`}
            : {}),
    };
}
