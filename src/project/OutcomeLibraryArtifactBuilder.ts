import {OutcomeLibraryBundleReader} from "../weightedoutcome/bundle/OutcomeLibraryBundleReader.js";
import type {OutcomeLibraryBundleReading} from "../weightedoutcome/bundle/OutcomeLibraryBundleReading.js";
import type {OutcomeLibraryBundleModeInput} from "../weightedoutcome/bundle/OutcomeLibraryBundleModeInput.js";
import {OutcomeLibraryBundleWriter} from "../weightedoutcome/bundle/OutcomeLibraryBundleWriter.js";
import {loadGameBlueprint} from "../generated/loadGameBlueprint.js";
import {GameBlueprintValidator} from "../generated/GameBlueprintValidator.js";
import {materializeReelStrips} from "../generated/materializeReelStrips.js";
import {resolveReelStripGeneration} from "../generated/resolveReelStripGeneration.js";
import {renderBuiltGameModule} from "../generated/renderBuiltGameModule.js";
import {computeGameBlueprintHash} from "../generated/computeGameBlueprintHash.js";
import {BetModeDefinition} from "../session/videoslot/betmode/BetModeDefinition.js";
import {BetModesConfig} from "../session/videoslot/betmode/BetModesConfig.js";
import {VideoSlotConfig} from "../session/videoslot/VideoSlotConfig.js";
import {VideoSlotSession} from "../session/videoslot/VideoSlotSession.js";
import {VideoSlotWinCalculator} from "../session/videoslot/wincalculator/VideoSlotWinCalculator.js";
import {CustomLinesDefinitions} from "../session/videoslot/linesdefinitions/CustomLinesDefinitions.js";
import {ReelsSymbolsSequencesGenerator} from "../session/videoslot/combinations/ReelsSymbolsSequencesGenerator.js";
import {SeededRandomNumberGenerator} from "../session/videoslot/combinations/SeededRandomNumberGenerator.js";
import {SymbolsCombinationsGenerator} from "../session/videoslot/combinations/SymbolsCombinationsGenerator.js";
import {SymbolsSequence} from "../session/videoslot/combinations/SymbolsSequence.js";
import {WaysWinCalculator} from "../session/videoslot/wincalculator/WaysWinCalculator.js";
import {ClusterWinCalculator} from "../session/videoslot/wincalculator/ClusterWinCalculator.js";
import {SelectedEvaluatorGroupWinAggregationPolicy} from "../session/videoslot/winevaluation/SelectedEvaluatorGroupWinAggregationPolicy.js";
import {FreeGamesForcedFeatureEntryHandler} from "../session/videoslot/betmode/FreeGamesForcedFeatureEntryHandler.js";
import {PerModeForcedFeatureEntryHandler} from "../session/videoslot/betmode/PerModeForcedFeatureEntryHandler.js";
import {VideoSlotWithBetModesSession} from "../session/videoslot/betmode/VideoSlotWithBetModesSession.js";
import {VideoSlotWithFreeGamesConfig} from "../session/videoslot/VideoSlotWithFreeGamesConfig.js";
import {VideoSlotWithFreeGamesSession} from "../session/videoslot/VideoSlotWithFreeGamesSession.js";
import {VideoSlotSessionSerializer} from "../net/videoslot/VideoSlotSessionSerializer.js";
import {generateExactWeightedOutcomeLibrary} from "../weightedoutcome/generate/generateExactWeightedOutcomeLibrary.js";
import type {PokieGame} from "../gamepackage/PokieGame.js";
import vm from "vm";
import type {OutcomeLibraryBundleWriting} from "../weightedoutcome/bundle/OutcomeLibraryBundleWriting.js";
import type {ArtifactBuilder} from "./ArtifactBuilder.js";
import type {ArtifactBuildResult} from "./ArtifactBuildResult.js";
import {assertArtifactDestinationAvailable} from "./internal/assertArtifactDestinationAvailable.js";
import type {PokieProject} from "./PokieProject.js";

// (Re)publishes an already-built "outcomeLibrary" bundle to a new destination, atomically -- every mode's
// manifest entry is read back (OutcomeLibraryBundleReader.readManifest), each mode's full outcome set is
// loaded (OutcomeLibraryBundleReader.readLibrary, the same reader loadWeightedOutcomeLibraryFromBundle wraps),
// and the result is streamed straight into OutcomeLibraryBundleWriter -- a WeightedOutcomeLibrary's own
// "outcomes" array is already exactly the Iterable<WeightedOutcomeInput> shape OutcomeLibraryBundleModeInput
// expects, so no field mapping happens here. A Blueprint source is the one additive case: it is validated,
// materialized and generated here so ArtifactBuilderRegistry remains the sole Project -> Outcome writer.
export class OutcomeLibraryArtifactBuilder implements ArtifactBuilder {
    public readonly target = "outcomeLibrary";
    public readonly destinationKind = "directory";

    private readonly reader: OutcomeLibraryBundleReading;
    private readonly writer: OutcomeLibraryBundleWriting;
    private readonly artifactPokieVersion: string;

    constructor(
        pokieVersion: string,
        reader: OutcomeLibraryBundleReading = new OutcomeLibraryBundleReader(),
        writer: OutcomeLibraryBundleWriting = new OutcomeLibraryBundleWriter(pokieVersion),
    ) {
        this.artifactPokieVersion = pokieVersion;
        this.reader = reader;
        this.writer = writer;
    }

    public async build(source: PokieProject, destinationPath: string): Promise<ArtifactBuildResult> {
        assertArtifactDestinationAvailable(destinationPath, this.destinationKind);

        if (source.type === "blueprint") {
            return this.generateFromBlueprint(source, destinationPath);
        }

        const manifest = await this.reader.readManifest(source.rootPath);
        const modes: OutcomeLibraryBundleModeInput[] = await Promise.all(
            manifest.modes.map(async (entry) => {
                const library = await this.reader.readLibrary(source.rootPath, entry.modeName);
                return {
                    modeName: entry.modeName,
                    libraryId: library.libraryId,
                    schemaVersion: library.schemaVersion,
                    outcomes: library.outcomes,
                    generator: entry.generator,
                };
            }),
        );

        const result = await this.writer.writeToDirectory(modes, destinationPath);
        const errors = result.issues.filter((issue) => issue.severity === "error");
        if (errors.length > 0 || result.manifest === undefined) {
            throw new Error(
                `Could not republish outcome-library bundle "${source.rootPath}" to "${destinationPath}": ${errors
                    .map((issue) => `${issue.code}: ${issue.message}`)
                    .join("; ")}`,
            );
        }

        return {outputPath: result.outDir};
    }

    private async generateFromBlueprint(source: PokieProject, destinationPath: string): Promise<ArtifactBuildResult> {
        const blueprint = loadGameBlueprint(source.rootPath);
        const errors = new GameBlueprintValidator().validate(blueprint).filter((issue) => issue.severity === "error");
        if (errors.length > 0) {
            throw new Error(`Blueprint "${source.rootPath}" has ${errors.length} error(s); fix it in Game Model and retry: ${errors.map((issue) => `${issue.code}: ${issue.message}`).join("; ")}`);
        }
        const resolution = resolveReelStripGeneration(blueprint);
        if (!resolution.success) {
            throw new Error(`Blueprint "${source.rootPath}" cannot generate its reels; fix it in Game Model and retry.`);
        }
        const materialized = materializeReelStrips(blueprint, resolution.reelStripGeneration);
        const module = {exports: {}} as {exports: unknown};
        vm.runInNewContext(renderBuiltGameModule(materialized, this.artifactPokieVersion), {require: (name: string) => {
            if (name !== "pokie") throw new Error(`Generated Blueprint requested unsupported module "${name}".`);
            return GENERATED_RUNTIME;
        }, module, exports: module.exports});
        const game = module.exports as PokieGame;
        const configHash = game.getConfigHash?.();
        if (configHash === undefined) throw new Error(`Blueprint "${source.rootPath}" did not materialize a configuration hash.`);
        const generated = await generateExactWeightedOutcomeLibrary({libraryId: `${game.getManifest().id}-base`, game, pokieVersion: this.artifactPokieVersion, configHash});
        const result = await this.writer.writeToDirectory([{modeName: "base", libraryId: generated.library.libraryId, schemaVersion: generated.library.schemaVersion, outcomes: generated.library.outcomes, generator: generated.diagnostics}], destinationPath);
        const writeErrors = result.issues.filter((issue) => issue.severity === "error");
        if (writeErrors.length > 0 || result.manifest === undefined) throw new Error(`Could not build Outcome Library: ${writeErrors.map((issue) => issue.message).join("; ")}`);
        return {outputPath: result.outDir};
    }

}

const GENERATED_RUNTIME = {BetModeDefinition, BetModesConfig, ClusterWinCalculator, computeGameBlueprintHash, CustomLinesDefinitions, FreeGamesForcedFeatureEntryHandler, PerModeForcedFeatureEntryHandler, ReelsSymbolsSequencesGenerator, SeededRandomNumberGenerator, SelectedEvaluatorGroupWinAggregationPolicy, SymbolsCombinationsGenerator, SymbolsSequence, VideoSlotConfig, VideoSlotSession, VideoSlotSessionSerializer, VideoSlotWinCalculator, VideoSlotWithBetModesSession, VideoSlotWithFreeGamesConfig, VideoSlotWithFreeGamesSession, WaysWinCalculator};
