import vm from "vm";
import type {GameBlueprint} from "../generated/GameBlueprint.js";
import {GameBlueprintValidator} from "../generated/GameBlueprintValidator.js";
import {materializeReelStrips} from "../generated/materializeReelStrips.js";
import {renderBuiltGameModule} from "../generated/renderBuiltGameModule.js";
import {resolveReelStripGeneration} from "../generated/resolveReelStripGeneration.js";
import {computeGameBlueprintHash} from "../generated/computeGameBlueprintHash.js";
import type {PokieGame} from "../gamepackage/PokieGame.js";
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
import {assertArtifactDestinationAvailable} from "./internal/assertArtifactDestinationAvailable.js";
import type {PokieProject} from "./PokieProject.js";
import {ManagedOutcomeProjectService, type ManagedOutcomeProjectServicing, type OutcomeProjectCompatibility} from "./ManagedOutcomeProjectService.js";

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

// Registry-owned prerequisite preparation for a Blueprint -> Stake request.  It deliberately materializes
// the Blueprint through the same generated runtime module a tsPackage contains, then drives the public exact
// outcome generator and canonical bundle writer.  There is consequently no second, hand-written Blueprint
// calculation or Stake export path hidden in a CLI/Studio caller.
export class BlueprintStakeOutcomeLibraryWorkflow {
    private readonly validator = new GameBlueprintValidator();
    private readonly pokieVersion: string;
    private readonly loadBlueprint: (filePath: string) => unknown;
    private readonly managedOutcomeProjects: ManagedOutcomeProjectServicing;
    private readonly writer: OutcomeLibraryBundleWriting;

    constructor(
        pokieVersion: string,
        loadBlueprint: (filePath: string) => unknown,
        managedOutcomeProjects: ManagedOutcomeProjectServicing = new ManagedOutcomeProjectService(),
        writer: OutcomeLibraryBundleWriting = new OutcomeLibraryBundleWriter(pokieVersion),
    ) {
        this.pokieVersion = pokieVersion;
        this.loadBlueprint = loadBlueprint;
        this.managedOutcomeProjects = managedOutcomeProjects;
        this.writer = writer;
    }

    // Plans/reuses an authoritative managed Outcome Project. This is the only Blueprint -> Outcome writer:
    // validate/materialize, exact generation, bundle verification and registration/reopen stay in this one
    // lifecycle for both direct Blueprint -> Outcome and Blueprint -> Stake requests.
    public async resolveOrGenerate(
        source: PokieProject,
        destinationPath: string | ((compatibility: OutcomeProjectCompatibility) => string),
    ): Promise<{readonly project: PokieProject; readonly reused: boolean}> {
        const blueprint = this.validateAndMaterialize(source.rootPath);
        const game = this.loadMaterializedGame(blueprint);
        const configHash = game.getConfigHash?.();
        if (configHash === undefined) {
            throw new Error(`Blueprint "${source.rootPath}" did not materialize a configuration hash; cannot safely register its outcome library.`);
        }

        const compatibility = {
            gameId: game.getManifest().id,
            gameVersion: game.getManifest().version,
            configHash,
            pokieVersion: this.pokieVersion,
        };
        const compatible = await this.managedOutcomeProjects.findCompatible(source.rootPath, compatibility);
        if (compatible !== undefined) {
            return {project: compatible, reused: true};
        }

        const bundleDir = typeof destinationPath === "string" ? destinationPath : destinationPath(compatibility);
        assertArtifactDestinationAvailable(bundleDir, "directory");
        await this.generateBundle(source.rootPath, game, configHash, bundleDir);
        return {project: await this.managedOutcomeProjects.registerAndOpen(source.rootPath, bundleDir, compatibility), reused: false};
    }

    private async generateBundle(blueprintPath: string, game: PokieGame, configHash: string, destinationPath: string): Promise<void> {
        const generated = await generateExactWeightedOutcomeLibrary({
            libraryId: `${game.getManifest().id}-base`,
            game,
            pokieVersion: this.pokieVersion,
            configHash,
        });
        const result = await this.writer.writeToDirectory(
            [{
                modeName: "base",
                libraryId: generated.library.libraryId,
                schemaVersion: generated.library.schemaVersion,
                outcomes: generated.library.outcomes,
                generator: generated.diagnostics,
            }],
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
