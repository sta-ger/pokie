import crypto from "crypto";
import fs from "fs";
import path from "path";
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
import {OutcomeLibraryBundleWriter} from "../weightedoutcome/bundle/OutcomeLibraryBundleWriter.js";
import {generateExactWeightedOutcomeLibrary} from "../weightedoutcome/generate/generateExactWeightedOutcomeLibrary.js";
import type {PokieProject} from "./PokieProject.js";
import {PROJECT_TYPE_CAPABILITIES} from "./ProjectCapabilities.js";

const REGISTRY_INDEX_PATH = path.join(".pokie", "outcome-library-registry.json");
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
    private readonly writer: OutcomeLibraryBundleWriter;

    constructor(private readonly pokieVersion: string, private readonly loadBlueprint: (filePath: string) => unknown) {
        this.writer = new OutcomeLibraryBundleWriter(pokieVersion);
    }

    public async resolveOrGenerate(source: PokieProject): Promise<PokieProject> {
        const blueprint = this.validateAndMaterialize(source.rootPath);
        const game = this.loadMaterializedGame(blueprint);
        const configHash = game.getConfigHash?.();
        if (configHash === undefined) {
            throw new Error(`Blueprint "${source.rootPath}" did not materialize a configuration hash; cannot safely register its outcome library.`);
        }

        const projectDir = path.dirname(source.rootPath);
        const compatible = await this.findCompatible(projectDir, game, configHash);
        if (compatible !== undefined) {
            return this.outcomeProject(compatible, "compatible registered outcome library");
        }

        const relativeBundleDir = path.join(".pokie", "outcome-libraries", crypto.createHash("sha256").update(configHash).digest("hex"));
        const bundleDir = path.join(projectDir, relativeBundleDir);
        const generated = await generateExactWeightedOutcomeLibrary({
            libraryId: `${game.getManifest().id}-base`,
            game,
            pokieVersion: this.pokieVersion,
            configHash,
        });
        const written = await this.writer.writeToDirectory(
            [{modeName: "base", libraryId: generated.library.libraryId, schemaVersion: generated.library.schemaVersion, outcomes: generated.library.outcomes, generator: generated.diagnostics}],
            bundleDir,
        );
        const errors = written.issues.filter((issue) => issue.severity === "error");
        if (errors.length > 0 || written.manifest === undefined) {
            throw new Error(`Could not register the generated Outcome Library: ${errors.map((issue) => `${issue.code}: ${issue.message}`).join("; ")}`);
        }
        this.record(projectDir, relativeBundleDir);
        return this.outcomeProject(bundleDir, "generated and registered outcome library");
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
        new Function("require", "module", "exports", renderBuiltGameModule(blueprint, this.pokieVersion))(
            (name: string) => {
                if (name !== "pokie") throw new Error(`Generated Blueprint requested unsupported module "${name}".`);
                return GENERATED_RUNTIME;
            },
            module,
            module.exports,
        );
        return module.exports as PokieGame;
    }

    private async findCompatible(projectDir: string, game: PokieGame, configHash: string): Promise<string | undefined> {
        for (const relativeBundleDir of this.discoveredBundleDirs(projectDir)) {
            const bundleDir = path.resolve(projectDir, relativeBundleDir);
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
                // A discovery index is an aid, not an authority.  A stale/removed/malformed entry simply
                // cannot satisfy this Blueprint's exact compatibility key.
            }
        }
        return undefined;
    }

    private discoveredBundleDirs(projectDir: string): string[] {
        const indexPath = path.join(projectDir, REGISTRY_INDEX_PATH);
        let indexed: string[] = [];
        try {
            const parsed: unknown = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
            if (Array.isArray(parsed)) indexed = parsed.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
        } catch {
            // No registry (or a damaged discovery aid) must not prevent a new deterministic build.
        }
        return Array.from(new Set(["outcomelibrary", ...indexed]));
    }

    private record(projectDir: string, relativeBundleDir: string): void {
        const indexPath = path.join(projectDir, REGISTRY_INDEX_PATH);
        const entries = this.discoveredBundleDirs(projectDir);
        if (entries.includes(relativeBundleDir)) return;
        fs.mkdirSync(path.dirname(indexPath), {recursive: true});
        fs.writeFileSync(indexPath, JSON.stringify([...entries.filter((entry) => entry !== "outcomelibrary"), relativeBundleDir], null, 4) + "\n", "utf-8");
    }

    private outcomeProject(rootPath: string, provenance: string): PokieProject {
        return {type: "outcomeLibrary", rootPath, capabilities: PROJECT_TYPE_CAPABILITIES.outcomeLibrary, provenance} as PokieProject;
    }
}
