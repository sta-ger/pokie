import crypto from "crypto";
import path from "path";
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
import {OutcomeLibraryBundleReader} from "../weightedoutcome/bundle/OutcomeLibraryBundleReader.js";
import type {PokieProject} from "./PokieProject.js";
import {ProjectTargetResolver} from "./ProjectTargetResolver.js";
import type {ProjectResolving} from "./ProjectResolving.js";

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
    private readonly reader = new OutcomeLibraryBundleReader();
    private readonly pokieVersion: string;
    private readonly loadBlueprint: (filePath: string) => unknown;
    private readonly resolveProject: ProjectResolving;

    constructor(
        pokieVersion: string,
        loadBlueprint: (filePath: string) => unknown,
        resolveProject: ProjectResolving = new ProjectTargetResolver(),
    ) {
        this.pokieVersion = pokieVersion;
        this.loadBlueprint = loadBlueprint;
        this.resolveProject = resolveProject;
    }

    // Plans/reuses the deterministic managed Outcome Project, but deliberately never writes a bundle itself.
    // The supplied callback is ArtifactBuilderRegistry.build("outcomeLibrary", ...), making the registry's
    // OutcomeLibraryArtifactBuilder the sole Blueprint -> Outcome materialization/publish boundary.
    public async resolveOrGenerate(source: PokieProject, buildOutcome: (destinationPath: string) => Promise<unknown>): Promise<PokieProject> {
        const blueprint = this.validateAndMaterialize(source.rootPath);
        const game = this.loadMaterializedGame(blueprint);
        const configHash = game.getConfigHash?.();
        if (configHash === undefined) {
            throw new Error(`Blueprint "${source.rootPath}" did not materialize a configuration hash; cannot safely register its outcome library.`);
        }

        const projectDir = path.dirname(source.rootPath);
        const bundleDir = path.join(projectDir, ".pokie", "outcome-libraries", crypto.createHash("sha256").update(configHash).digest("hex"));
        const compatible = await this.findCompatible(bundleDir, game, configHash);
        if (compatible !== undefined) {
            return this.openOutcomeProject(compatible, "compatible managed outcome library");
        }

        await buildOutcome(bundleDir);
        return this.openOutcomeProject(bundleDir, "generated managed outcome library");
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

    private async findCompatible(bundleDir: string, game: PokieGame, configHash: string): Promise<string | undefined> {
        try {
            const manifest = await this.reader.readManifest(bundleDir);
            if (
                manifest.game.id === game.getManifest().id &&
                manifest.game.version === game.getManifest().version &&
                manifest.configHash === configHash &&
                manifest.artifactPokieVersion === this.pokieVersion
            ) {
                return bundleDir;
            }
        } catch {
            // The deterministic managed location has not yet been built, or no longer contains a valid bundle.
        }
        return undefined;
    }

    private async openOutcomeProject(rootPath: string, provenance: string): Promise<PokieProject> {
        const resolved = await this.resolveProject.resolve(rootPath);
        if (resolved?.type !== "outcomeLibrary") {
            throw new Error(`Generated Outcome Library at "${rootPath}" could not be opened as a managed Outcome Project.`);
        }
        return {...resolved, provenance: `${provenance}; ${resolved.provenance}`} as PokieProject;
    }
}
