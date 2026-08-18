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
import {generateExactWeightedOutcomeLibrary} from "../weightedoutcome/generate/generateExactWeightedOutcomeLibrary.js";
import {estimateExactOutcomeSpaceSize} from "../weightedoutcome/generate/estimateExactOutcomeSpaceSize.js";
import {assertArtifactDestinationAvailable} from "./internal/assertArtifactDestinationAvailable.js";
import {assertArtifactDestinationIsSafe} from "./internal/assertArtifactDestinationIsSafe.js";
import type {PokieProject} from "./PokieProject.js";
import {ManagedOutcomeProjectService, type ManagedOutcomeProjectServicing, type OutcomeProjectCompatibility} from "./ManagedOutcomeProjectService.js";
import {
    assertArtifactBuildNotCancelled,
    reportArtifactBuildProgress,
    type ArtifactBuildOptions,
    type ArtifactBuildPreflight,
} from "./ArtifactBuildOptions.js";

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
    ): Promise<{readonly project: PokieProject; readonly reused: boolean}> {
        assertArtifactBuildNotCancelled(options);
        const game = source.type === "blueprint" ? this.loadMaterializedGame(this.validateAndMaterialize(source.rootPath)) : await this.loadGame(source.rootPath);
        const configHash = game.getConfigHash?.();
        if (configHash === undefined) {
            throw new Error(`Project "${source.rootPath}" did not materialize a configuration hash; cannot safely register its outcome library.`);
        }

        const compatibility = {
            gameId: game.getManifest().id,
            gameVersion: game.getManifest().version,
            configHash,
            pokieVersion: this.pokieVersion,
        };
        const compatible = await this.managedOutcomeProjects.findCompatible(source.rootPath, compatibility);
        if (compatible !== undefined) {
            reportArtifactBuildProgress(options, {status: "completed"});
            return {project: compatible, reused: true};
        }

        const bundleDir = typeof destinationPath === "string" ? destinationPath : destinationPath(compatibility);
        assertArtifactDestinationAvailable(bundleDir, "directory");
        assertArtifactDestinationIsSafe(source.rootPath, bundleDir);
        const preflight = outcomeGenerationPreflight(game);
        reportArtifactBuildProgress(options, {status: "preflight", preflight});
        assertArtifactBuildNotCancelled(options);
        try {
            await this.generateBundle(source.rootPath, game, configHash, bundleDir, options, preflight);
            assertArtifactBuildNotCancelled(options);
            const project = await this.managedOutcomeProjects.registerAndOpen(source.rootPath, bundleDir, compatibility);
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
            await fs.promises.rm(bundleDir, {recursive: true, force: true}).catch(() => undefined);
            if (options?.signal?.aborted) reportArtifactBuildProgress(options, {status: "cancelled", preflight});
            else reportArtifactBuildProgress(options, {status: "failed", preflight});
            throw error;
        }
    }

    private async generateBundle(
        blueprintPath: string,
        game: PokieGame,
        configHash: string,
        destinationPath: string,
        options: ArtifactBuildOptions | undefined,
        preflight: ArtifactBuildPreflight,
    ): Promise<void> {
        const declaredModes = game.getBetModes?.();
        // A package without the optional bet-mode contract still has the canonical base runtime.  Do not
        // pretend that base is selectable, though: only a declared runtime mode is passed to the exact
        // session selector below.
        const modes = declaredModes && declaredModes.length > 0 ? declaredModes : [{id: "base"}];
        const generated = await Promise.all(
            modes.map(async (mode) => ({
                mode,
                generated: await generateExactWeightedOutcomeLibrary({
                    libraryId: `${game.getManifest().id}-${mode.id}`,
                    game,
                    pokieVersion: this.pokieVersion,
                    configHash,
                    ...(declaredModes && declaredModes.length > 0 ? {betMode: mode.id} : {}),
                    selectBetMode: declaredModes !== undefined && declaredModes.length > 0,
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
            destinationPath,
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

function outcomeGenerationPreflight(game: PokieGame): ArtifactBuildPreflight {
    const estimate = estimateExactOutcomeSpaceSize(game);
    const estimatedItemCount = estimate.totalOutcomeSpaceSize;
    return {
        estimatedItemCount,
        // A generated outcome record contains a round artifact, so this intentionally conservative estimate is
        // a planning signal only; the precise output size is unknown until grids have been deduplicated.
        estimatedBytes: estimatedItemCount * BigInt(1024),
        ...(estimatedItemCount > BigInt(10_000)
            ? {complexityWarning: `Exact generation will enumerate ${estimatedItemCount} reel-stop combinations.`}
            : {}),
    };
}
