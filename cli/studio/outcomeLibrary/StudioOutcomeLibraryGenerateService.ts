import {
    DEFAULT_MAX_EXACT_OUTCOME_SPACE_SIZE,
    GenerateExactWeightedOutcomeLibraryOptions,
    GenerateExactWeightedOutcomeLibraryResult,
    loadPokieGame,
    OutcomeLibraryBundleModeInput,
    OutcomeLibraryBundleReader,
    OutcomeLibraryBundleReading,
    OutcomeLibraryBundleWriter,
    OutcomeLibraryBundleWriting,
    OutcomeSpaceEstimate,
    PokieGame,
    WeightedOutcomeLibraryGenerationError,
    estimateExactOutcomeSpaceSize,
    generateExactWeightedOutcomeLibrary,
} from "pokie";
import fs from "fs";
import {resolveProjectDirectory} from "./resolveProjectDirectory.js";
import type {StudioOutcomeLibraryGenerateEstimateView} from "./StudioOutcomeLibraryGenerateEstimateView.js";
import type {StudioOutcomeLibraryGenerateResultView} from "./StudioOutcomeLibraryGenerateResultView.js";
import type {StudioOutcomeLibraryRegistryView} from "./StudioOutcomeLibraryRegistryView.js";
import type {ValidatedOutcomeLibraryGenerateEstimateRequest} from "./validateOutcomeLibraryGenerateEstimateRequest.js";
import type {ValidatedOutcomeLibraryGenerateRequest} from "./validateOutcomeLibraryGenerateRequest.js";

// Same bigint-safe number-or-decimal-string convention as OutcomeLibraryCommand's own
// formatBigIntSafely/toBigIntSafeDecimal -- a raw reel-stop combination count routinely exceeds
// Number.MAX_SAFE_INTEGER, so it's only ever silently narrowed to a plain `number` when it's actually
// small enough to survive that round-trip.
function formatBigIntSafely(value: bigint): number | string {
    return value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : value.toString();
}

function toNumberApprox(value: number | string): number {
    return typeof value === "number" ? value : Number(value);
}

type OtherModesResult = {readonly status: "ok"; readonly modes: readonly OutcomeLibraryBundleModeInput<string>[]} | {readonly status: "error"; readonly message: string};

// The Project Dashboard's Generate step (and Registry panel), built directly on top of the exact same
// public generation service "pokie outcomelibrary generate"/"build" already drive
// (generateExactWeightedOutcomeLibrary / estimateExactOutcomeSpaceSize / OutcomeLibraryBundleWriter) --
// this class never computes an outcome space, sweeps a reel-stop tuple, or plays a round itself; it only
// owns Studio-specific plumbing: resolving the project's own build (packageRoot === projectRoot, same
// convention as StudioSimulationService), writing straight into the project's one conventional bundle
// directory rather than a caller-chosen --out file, and preserving any of that bundle's OTHER modes across
// a single-mode regenerate (the writer's own writeToDirectory always atomically replaces the whole
// directory -- see its own doc comment -- so every mode not being regenerated is first read back in full
// and re-supplied alongside the freshly generated one).
//
// Deliberately synchronous request/response, unlike StudioSimulationService's own queued background jobs:
// exact enumeration already fails closed (via maxOutcomeSpaceSize/--bounded) well before a space too large
// to sweep in a single HTTP request would be attempted, so there is no long-running-job lifecycle to model
// here yet. A future large-scale Generate flow could revisit that, the same way Simulation's own job queue
// did.
export class StudioOutcomeLibraryGenerateService {
    public static readonly DEFAULT_BUNDLE_DIR = "outcomelibrary";

    private readonly pokieVersion: string;
    private readonly loadGame: typeof loadPokieGame;
    private readonly estimateSpace: (game: PokieGame) => OutcomeSpaceEstimate;
    private readonly generateLibrary: (options: GenerateExactWeightedOutcomeLibraryOptions) => Promise<GenerateExactWeightedOutcomeLibraryResult>;
    private readonly writer: OutcomeLibraryBundleWriting<string>;
    private readonly bundleReader: OutcomeLibraryBundleReading<string>;
    private readonly realpath: (resolvedPath: string) => string;
    private readonly directoryExists: (dirPath: string) => boolean;

    constructor(
        pokieVersion: string,
        loadGame: typeof loadPokieGame = loadPokieGame,
        estimateSpace: (game: PokieGame) => OutcomeSpaceEstimate = estimateExactOutcomeSpaceSize,
        generateLibrary: (options: GenerateExactWeightedOutcomeLibraryOptions) => Promise<GenerateExactWeightedOutcomeLibraryResult> = generateExactWeightedOutcomeLibrary,
        writer: OutcomeLibraryBundleWriting<string> = new OutcomeLibraryBundleWriter<string>(pokieVersion),
        bundleReader: OutcomeLibraryBundleReading<string> = new OutcomeLibraryBundleReader<string>(),
        realpath: (resolvedPath: string) => string = (resolvedPath) => fs.realpathSync(resolvedPath),
        directoryExists: (dirPath: string) => boolean = (dirPath) => fs.existsSync(dirPath),
    ) {
        this.pokieVersion = pokieVersion;
        this.loadGame = loadGame;
        this.estimateSpace = estimateSpace;
        this.generateLibrary = generateLibrary;
        this.writer = writer;
        this.bundleReader = bundleReader;
        this.realpath = realpath;
        this.directoryExists = directoryExists;
    }

    // The cheap, non-enumerating dry run over estimateExactOutcomeSpaceSize -- exactly the probe "pokie
    // outcomelibrary generate --estimate" itself runs (see OutcomeLibraryCommand.executeEstimate), so the
    // Generate step's own "estimate/cost" panel never disagrees with what the CLI would report for the
    // same package/options.
    public async estimate(projectRoot: string, request: ValidatedOutcomeLibraryGenerateEstimateRequest): Promise<StudioOutcomeLibraryGenerateEstimateView> {
        let game: PokieGame;
        try {
            game = await this.loadGame(projectRoot);
        } catch (error) {
            return {status: "load-error", error: error instanceof Error ? error.message : String(error)};
        }

        let estimate: OutcomeSpaceEstimate;
        try {
            estimate = this.estimateSpace(game);
        } catch (error) {
            if (error instanceof WeightedOutcomeLibraryGenerationError) {
                return {status: "unsupported", error: error.message};
            }
            throw error;
        }

        const maxOutcomeSpaceSize = request.maxOutcomeSpaceSize ?? DEFAULT_MAX_EXACT_OUTCOME_SPACE_SIZE;
        const strategy = estimate.totalOutcomeSpaceSize > maxOutcomeSpaceSize ? "bounded-coverage" : "exact";

        return {
            status: "ok",
            game: game.getManifest(),
            reelsNumber: estimate.reelsNumber,
            reelsSymbolsNumber: estimate.reelsSymbolsNumber,
            reelSizes: estimate.reelSizes,
            totalOutcomeSpaceSize: formatBigIntSafely(estimate.totalOutcomeSpaceSize),
            maxOutcomeSpaceSize: formatBigIntSafely(maxOutcomeSpaceSize),
            strategy,
            requiresBounded: strategy === "bounded-coverage",
        };
    }

    // Drives generateExactWeightedOutcomeLibrary -- the exact same "core, reusable public producer" (see
    // its own doc comment) "pokie outcomelibrary generate" calls -- then immediately persists the result
    // into the project's own conventional outcome-library bundle via OutcomeLibraryBundleWriter, the same
    // writer "pokie outcomelibrary build" uses. Every other mode already in that bundle is preserved (see
    // this class's own doc comment); only "request.mode ?? 'base'" is (re)computed.
    public async generate(projectRoot: string, request: ValidatedOutcomeLibraryGenerateRequest): Promise<StudioOutcomeLibraryGenerateResultView> {
        let game: PokieGame;
        try {
            game = await this.loadGame(projectRoot);
        } catch (error) {
            return {status: "load-error", error: error instanceof Error ? error.message : String(error)};
        }

        const manifest = game.getManifest();
        const modeName = request.mode ?? "base";
        const libraryId = request.libraryId ?? `${manifest.id}${request.mode !== undefined ? `-${request.mode}` : ""}`;
        const outDirRelative = request.outDir ?? StudioOutcomeLibraryGenerateService.DEFAULT_BUNDLE_DIR;

        const resolvedOutDir = resolveProjectDirectory(projectRoot, outDirRelative, this.realpath);
        if (resolvedOutDir.status === "error") {
            return {status: "load-error", error: resolvedOutDir.message};
        }

        let generated: GenerateExactWeightedOutcomeLibraryResult;
        try {
            const generateOptions: GenerateExactWeightedOutcomeLibraryOptions = {
                libraryId,
                game,
                pokieVersion: this.pokieVersion,
                ...(request.configHash !== undefined ? {configHash: request.configHash} : {}),
                ...(request.mode !== undefined ? {betMode: request.mode} : {}),
                ...(request.stake !== undefined ? {stake: request.stake} : {}),
                ...(request.maxOutcomeSpaceSize !== undefined ? {maxOutcomeSpaceSize: request.maxOutcomeSpaceSize} : {}),
                ...(request.bounded !== undefined ? {bounded: request.bounded} : {}),
            };
            generated = await this.generateLibrary(generateOptions);
        } catch (error) {
            if (error instanceof WeightedOutcomeLibraryGenerationError) {
                if (error.getCode() === "weighted-outcome-library-generation-unsupported") {
                    return {status: "unsupported", error: error.message};
                }
                return {status: "generation-error", code: error.getCode(), error: error.message};
            }
            throw error;
        }

        const otherModes = await this.readOtherModes(resolvedOutDir.resolvedPath, modeName);
        if (otherModes.status === "error") {
            return {status: "load-error", error: otherModes.message};
        }

        const modes: OutcomeLibraryBundleModeInput<string>[] = [
            ...otherModes.modes,
            {modeName, libraryId, schemaVersion: generated.library.schemaVersion, outcomes: generated.library.outcomes, generator: generated.diagnostics},
        ];

        const writeResult = await this.writer.writeToDirectory(modes, resolvedOutDir.resolvedPath);
        const errors = writeResult.issues.filter((issue) => issue.severity === "error");
        if (errors.length > 0 || writeResult.manifest === undefined) {
            return {status: "invalid", errors, warnings: writeResult.issues.filter((issue) => issue.severity !== "error")};
        }

        const modeEntry = writeResult.manifest.modes.find((entry) => entry.modeName === modeName);
        if (modeEntry === undefined) {
            // Guaranteed present by the writer whenever it returns a manifest at all (one entry per input
            // mode that didn't itself error) -- reachable only if the writer's own contract changes.
            return {status: "load-error", error: `The bundle write to "${outDirRelative}" did not report mode "${modeName}".`};
        }

        const coverage = generated.diagnostics.strategy === "exact" ? 1 : toNumberApprox(generated.diagnostics.sampledRawCount) / toNumberApprox(generated.diagnostics.totalOutcomeSpaceSize);

        return {
            status: "ok",
            bundleDir: outDirRelative,
            files: writeResult.files,
            warnings: writeResult.issues,
            mode: {
                modeName,
                libraryId: modeEntry.libraryId,
                hash: modeEntry.libraryHash,
                outcomeCount: modeEntry.outcomeCount,
                totalWeight: modeEntry.totalWeight,
                rtp: modeEntry.analysis.rtp,
            },
            generator: generated.diagnostics,
            coverage,
            selector: {kind: "bundle", bundleDir: outDirRelative, modeName},
        };
    }

    // The Registry's own "does a compatible library already exist for this build?" check -- see
    // StudioOutcomeLibraryRegistryView's own doc comment for what "compatible"/"stale"/"wrong"/"missing"
    // mean here.
    public async registry(projectRoot: string): Promise<StudioOutcomeLibraryRegistryView> {
        let game: PokieGame;
        try {
            game = await this.loadGame(projectRoot);
        } catch (error) {
            return {status: "load-error", error: error instanceof Error ? error.message : String(error)};
        }
        const currentGame = game.getManifest();

        const resolved = resolveProjectDirectory(projectRoot, StudioOutcomeLibraryGenerateService.DEFAULT_BUNDLE_DIR, this.realpath);
        if (resolved.status === "error") {
            return {status: "load-error", error: resolved.message};
        }
        if (!this.directoryExists(resolved.resolvedPath)) {
            return {status: "ok", bundleDir: StudioOutcomeLibraryGenerateService.DEFAULT_BUNDLE_DIR, buildStatus: "missing"};
        }

        let manifest;
        try {
            manifest = await this.bundleReader.readManifest(resolved.resolvedPath);
        } catch (error) {
            return {
                status: "load-error",
                error: `Could not read the outcome library bundle at "${StudioOutcomeLibraryGenerateService.DEFAULT_BUNDLE_DIR}": ${error instanceof Error ? error.message : String(error)}`,
            };
        }

        let buildStatus: "compatible" | "stale" | "wrong";
        if (manifest.game.id !== currentGame.id) {
            buildStatus = "wrong";
        } else if (manifest.game.version !== currentGame.version || manifest.artifactPokieVersion !== this.pokieVersion) {
            buildStatus = "stale";
        } else {
            buildStatus = "compatible";
        }

        return {
            status: "ok",
            bundleDir: StudioOutcomeLibraryGenerateService.DEFAULT_BUNDLE_DIR,
            buildStatus,
            game: manifest.game,
            currentGame,
            ...(manifest.configHash !== undefined ? {configHash: manifest.configHash} : {}),
            artifactPokieVersion: manifest.artifactPokieVersion,
            currentPokieVersion: this.pokieVersion,
            generatedAt: manifest.generatedAt,
            modes: manifest.modes.map((entry) => ({
                modeName: entry.modeName,
                libraryId: entry.libraryId,
                outcomeCount: entry.outcomeCount,
                totalWeight: entry.totalWeight,
                rtp: entry.analysis.rtp,
                hash: entry.libraryHash,
                ...(entry.generator !== undefined ? {strategy: entry.generator.strategy, generatedAt: entry.generator.generatedAt} : {}),
            })),
        };
    }

    // Reconstructs every mode OTHER than `excludeModeName` already in the bundle at `resolvedOutDir`, as
    // fresh OutcomeLibraryBundleModeInput entries ready to hand straight back into writeToDirectory --
    // required because writeToDirectory always atomically replaces the whole directory with exactly the
    // modes it's given (see OutcomeLibraryBundleWriter's own doc comment), never merges. A directory that
    // doesn't exist yet simply has no other modes to preserve; a directory that exists but doesn't parse as
    // a valid bundle is left alone rather than silently clobbered.
    private async readOtherModes(resolvedOutDir: string, excludeModeName: string): Promise<OtherModesResult> {
        if (!this.directoryExists(resolvedOutDir)) {
            return {status: "ok", modes: []};
        }

        let manifest;
        try {
            manifest = await this.bundleReader.readManifest(resolvedOutDir);
        } catch (error) {
            return {
                status: "error",
                message: `"${resolvedOutDir}" already exists but is not a valid outcome library bundle, so it cannot be safely regenerated into: ${error instanceof Error ? error.message : String(error)}`,
            };
        }

        const modes: OutcomeLibraryBundleModeInput<string>[] = [];
        for (const entry of manifest.modes) {
            if (entry.modeName === excludeModeName) {
                continue;
            }
            const library = await this.bundleReader.readLibrary(resolvedOutDir, entry.modeName);
            modes.push({
                modeName: entry.modeName,
                libraryId: library.libraryId,
                schemaVersion: library.schemaVersion,
                outcomes: library.outcomes,
                ...(entry.generator !== undefined ? {generator: entry.generator} : {}),
            });
        }
        return {status: "ok", modes};
    }
}
