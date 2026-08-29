import {
    GenerateExactWeightedOutcomeLibraryResult,
    loadPokieGame,
    OutcomeLibraryBundleManifest,
    OutcomeLibraryBundleModeInput,
    OutcomeLibraryBundleReader,
    OutcomeLibraryBundleReading,
    OutcomeLibraryBundleWriter,
    OutcomeLibraryBundleWriting,
    OutcomeSpaceEstimate,
    OutcomeLibraryGenerationRequest,
    PokieGame,
    WeightedOutcomeLibraryGenerationError,
    ArtifactConversionPlanner,
    describeArtifactConversionPlanDiagnostic,
    estimateExactOutcomeSpaceSize,
    generateWeightedOutcomeLibrary,
    preflightOutcomeLibraryGenerationFromEstimate,
} from "pokie";
import fs from "fs";
import path from "path";
import {resolveProjectDirectory} from "./resolveProjectDirectory.js";
import {StudioArtifactConversionPlanning, StudioArtifactConversionPlanningService} from "../artifacts/StudioArtifactConversionPlanningService.js";
import {describePreparedArtifactPlanDrift} from "../artifacts/describePreparedArtifactPlanDrift.js";
import {createUnresolvedRuntimePlan} from "../artifacts/createExternalArtifactConversionPlan.js";
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

// Service methods remain callable by existing in-process users that supplied
// the pre-PC-09 validated shape directly. HTTP validation always fills the
// canonical fields; this adapter is deliberately the one compatibility seam.
function resolveGeneration(request: {generation?: "default" | "exact" | "sampled" | "bounded"; sampled?: {sampleSize: bigint; seed: string}; bounded?: {sampleSize: bigint; seed: string}}): "default" | "exact" | "sampled" | "bounded" {
    if (request.generation !== undefined) return request.generation;
    if (request.sampled !== undefined) return "sampled";
    if (request.bounded !== undefined) return "bounded";
    return "default";
}

function resolveSample(request: {sample?: {sampleSize: bigint; seed: string}; sampled?: {sampleSize: bigint; seed: string}; bounded?: {sampleSize: bigint; seed: string}}): {sampleSize: bigint; seed: string} | undefined {
    return request.sample ?? request.sampled ?? request.bounded;
}

type OtherModesResult = {readonly status: "ok"; readonly modes: readonly OutcomeLibraryBundleModeInput<string>[]} | {readonly status: "error"; readonly message: string};

// The Project Dashboard's Generate step (and Registry panel), built directly on top of the exact same
// public generation service "pokie outcomelibrary generate"/"build" already drive
// (generateExactWeightedOutcomeLibrary / estimateExactOutcomeSpaceSize / OutcomeLibraryBundleWriter) --
// this class never computes an outcome space, sweeps a reel-stop tuple, or plays a round itself; it only
// owns Studio-specific plumbing: resolving the project's own build (packageRoot === projectRoot, same
// convention as StudioSimulationService), writing into the project's conventional bundle directory by
// default or a caller-chosen outDir when given (both are tracked and later discoverable by registry(), see
// its own doc comment), and preserving any of that bundle's OTHER modes across a single-mode regenerate
// (the writer's own writeToDirectory always atomically replaces the whole directory -- see its own doc
// comment -- so every mode not being regenerated is first read back in full and re-supplied alongside the
// freshly generated one).
//
// Deliberately synchronous request/response, unlike StudioSimulationService's own queued background jobs:
// exact enumeration already fails closed (via maxOutcomeSpaceSize/--bounded) well before a space too large
// to sweep in a single HTTP request would be attempted, so there is no long-running-job lifecycle to model
// here yet. A future large-scale Generate flow could revisit that, the same way Simulation's own job queue
// did.
export class StudioOutcomeLibraryGenerateService {
    public static readonly DEFAULT_BUNDLE_DIR = "outcomelibrary";
    // Project-scoped, persisted on disk -- deliberately NOT inside DEFAULT_BUNDLE_DIR or any
    // caller-chosen outDir (a bundle directory is always atomically replaced wholesale by the writer, see
    // this class's own doc comment, so anything living inside one would be silently destroyed the next
    // time that directory is regenerated). Holds only the discovery index (see readRegistryIndex/
    // recordDiscoveredBundleDir's own doc comments) -- never outcome data itself, so losing or hand-editing
    // this file can at worst make a real bundle temporarily undiscoverable, never corrupt one.
    private static readonly REGISTRY_INDEX_RELATIVE_PATH = path.join(".pokie", "outcome-library-registry.json");

    private readonly pokieVersion: string;
    private readonly loadGame: typeof loadPokieGame;
    private readonly estimateSpace: (game: PokieGame) => OutcomeSpaceEstimate;
    private readonly generateLibrary: (request: OutcomeLibraryGenerationRequest) => Promise<GenerateExactWeightedOutcomeLibraryResult>;
    private readonly writer: OutcomeLibraryBundleWriting<string>;
    private readonly bundleReader: OutcomeLibraryBundleReading<string>;
    private readonly realpath: (resolvedPath: string) => string;
    private readonly directoryExists: (dirPath: string) => boolean;
    private readonly isDirectory: (dirPath: string) => boolean;
    private readonly readTextFile: (filePath: string) => string;
    private readonly writeTextFile: (filePath: string, contents: string) => void;
    private readonly ensureDirectory: (dirPath: string) => void;
    private readonly planning: StudioArtifactConversionPlanning;
    private readonly planner = new ArtifactConversionPlanner();

    constructor(
        pokieVersion: string,
        loadGame: typeof loadPokieGame = loadPokieGame,
        estimateSpace: (game: PokieGame) => OutcomeSpaceEstimate = estimateExactOutcomeSpaceSize,
        generateLibrary: (request: OutcomeLibraryGenerationRequest) => Promise<GenerateExactWeightedOutcomeLibraryResult> = generateWeightedOutcomeLibrary,
        writer: OutcomeLibraryBundleWriting<string> = new OutcomeLibraryBundleWriter<string>(pokieVersion),
        bundleReader: OutcomeLibraryBundleReading<string> = new OutcomeLibraryBundleReader<string>(),
        realpath: (resolvedPath: string) => string = (resolvedPath) => fs.realpathSync(resolvedPath),
        directoryExists: (dirPath: string) => boolean = (dirPath) => fs.existsSync(dirPath),
        isDirectory: (dirPath: string) => boolean = (dirPath) => {
            try {
                return fs.statSync(dirPath).isDirectory();
            } catch {
                return false;
            }
        },
        readTextFile: (filePath: string) => string = (filePath) => fs.readFileSync(filePath, "utf-8"),
        writeTextFile: (filePath: string, contents: string) => void = (filePath, contents) => fs.writeFileSync(filePath, contents, "utf-8"),
        ensureDirectory: (dirPath: string) => void = (dirPath) => fs.mkdirSync(dirPath, {recursive: true}),
        planning: StudioArtifactConversionPlanning = new StudioArtifactConversionPlanningService(pokieVersion),
    ) {
        this.pokieVersion = pokieVersion;
        this.loadGame = loadGame;
        this.estimateSpace = estimateSpace;
        this.generateLibrary = generateLibrary;
        this.writer = writer;
        this.bundleReader = bundleReader;
        this.realpath = realpath;
        this.directoryExists = directoryExists;
        this.isDirectory = isDirectory;
        this.readTextFile = readTextFile;
        this.writeTextFile = writeTextFile;
        this.ensureDirectory = ensureDirectory;
        this.planning = planning;
    }

    // The cheap, non-enumerating dry run over estimateExactOutcomeSpaceSize -- exactly the probe "pokie
    // outcomelibrary generate --estimate" itself runs (see OutcomeLibraryCommand.executeEstimate), so the
    // Generate step's own "estimate/cost" panel never disagrees with what the CLI would report for the
    // same package/options.
    public async estimate(projectRoot: string, request: ValidatedOutcomeLibraryGenerateEstimateRequest): Promise<StudioOutcomeLibraryGenerateEstimateView> {
        const plan = await this.planning.prepare(projectRoot, "outcomeLibrary");
        // The estimate is a preview of this action, not a second source-capability
        // probe.  Once the shared planner says that the opened project cannot
        // reach an Outcome Library, do not load its runtime and accidentally
        // present an executable-looking estimate.
        if (plan.status !== "planned") {
            return {status: "unsupported", error: describeArtifactConversionPlanDiagnostic(plan) ?? plan.diagnostic?.message ?? "Outcome library generation is unavailable.", plan};
        }
        let game: PokieGame;
        try {
            game = await this.loadGame(projectRoot);
        } catch (error) {
            return {status: "load-error", error: error instanceof Error ? error.message : String(error), plan};
        }

        let estimate: OutcomeSpaceEstimate;
        try {
            estimate = this.estimateSpace(game);
        } catch (error) {
            if (error instanceof WeightedOutcomeLibraryGenerationError) {
                return {status: "unsupported", error: error.message, plan};
            }
            throw error;
        }

        const generation = resolveGeneration(request);
        const sample = resolveSample(request);
        const preflight = preflightOutcomeLibraryGenerationFromEstimate(estimate, {
            generation,
            ...(request.maxOutcomeSpaceSize === undefined ? {} : {maxExactOutcomeSpaceSize: request.maxOutcomeSpaceSize}),
            ...(sample === undefined ? {} : {sample}),
        });

        return {
            status: "ok",
            game: game.getManifest(),
            reelsNumber: estimate.reelsNumber,
            reelsSymbolsNumber: estimate.reelsSymbolsNumber,
            reelSizes: estimate.reelSizes,
            totalOutcomeSpaceSize: formatBigIntSafely(estimate.totalOutcomeSpaceSize),
            maxOutcomeSpaceSize: formatBigIntSafely(preflight.maxExactOutcomeSpaceSize),
            strategy: preflight.strategy,
            requiresBounded: preflight.requiresSampledOptIn,
            expectedRawWork: formatBigIntSafely(preflight.expectedRawWork),
            warnings: preflight.warnings,
            ...(preflight.sample === undefined ? {} : {sampleSize: formatBigIntSafely(preflight.sample.sampleSize), seed: preflight.sample.seed}),
            plan,
        };
    }

    // Drives generateExactWeightedOutcomeLibrary -- the exact same "core, reusable public producer" (see
    // its own doc comment) "pokie outcomelibrary generate" calls -- then immediately persists the result
    // into the project's own conventional outcome-library bundle via OutcomeLibraryBundleWriter, the same
    // writer "pokie outcomelibrary build" uses. Every other mode already in that bundle is preserved (see
    // this class's own doc comment); only "request.mode ?? 'base'" is (re)computed.
    public async generate(projectRoot: string, request: ValidatedOutcomeLibraryGenerateRequest): Promise<StudioOutcomeLibraryGenerateResultView> {
        const outDirRelative = request.outDir ?? StudioOutcomeLibraryGenerateService.DEFAULT_BUNDLE_DIR;
        const modeName = request.mode ?? "base";
        const generation = resolveGeneration(request);
        const sample = resolveSample(request);
        const requestedGeneration = generation === "sampled" || generation === "bounded"
            ? {generationSemantics: "boundedSample" as const, sampleCount: sample!.sampleSize, sampleSeed: sample!.seed}
            : {generationSemantics: "exact" as const};
        // The requested bundle directory is part of the prepared decision, not a
        // writer-local default.  In particular this keeps an occupied or aliased
        // destination from being silently treated as a mode-update after a preview
        // described a different publication.
        const resolvedOutDir = resolveProjectDirectory(projectRoot, outDirRelative, this.realpath);
        if (resolvedOutDir.status === "error") {
            return {status: "load-error", error: resolvedOutDir.message, plan: createUnresolvedRuntimePlan(projectRoot, "outcomeLibrary")};
        }
        const plan = await this.planning.prepare(projectRoot, "outcomeLibrary", resolvedOutDir.resolvedPath, requestedGeneration);
        if (plan.status === "conflict") {
            return {status: "conflict", error: plan.diagnostic?.message ?? "Outcome library generation has a destination conflict.", plan};
        }
        if (plan.status === "unavailable") {
            return {status: "unsupported", error: describeArtifactConversionPlanDiagnostic(plan) ?? plan.diagnostic?.message ?? "Outcome library generation is unavailable.", plan};
        }
        const planDrift = describePreparedArtifactPlanDrift(
            plan,
            projectRoot,
            "outcomeLibrary",
            resolvedOutDir.resolvedPath,
            requestedGeneration.generationSemantics,
            sample?.sampleSize,
            sample?.seed,
        );
        if (planDrift !== undefined) {
            return {status: "load-error", error: planDrift, plan};
        }
        type PreparedGenerationRead =
            | {readonly status: "terminal"; readonly view: StudioOutcomeLibraryGenerateResultView}
            | {
                readonly status: "ready";
                readonly modes: readonly OutcomeLibraryBundleModeInput<string>[];
                readonly libraryId: string;
                readonly generator: GenerateExactWeightedOutcomeLibraryResult["diagnostics"];
            };
        try {
            const execution = await this.planner.executeConversionPlan(plan, {
                // Resolve again at both prepared-operation binding points. This
                // binds the actual runtime source rather than treating the
                // preview plan as a one-time guard.
                currentSource: async () => (await this.planning.prepare(projectRoot, "outcomeLibrary", resolvedOutDir.resolvedPath, requestedGeneration)).source,
                read: async (): Promise<PreparedGenerationRead> => {
                    const reuse = plan.steps.find((step) => step.kind === "reuseManagedOutcomeLibrary");
                    if (reuse !== undefined) {
                        const sourceDir = reuse.output.canonicalLocation;
                        if (sourceDir === undefined) return {status: "terminal", view: {status: "load-error", error: "The prepared reusable Outcome Library has no canonical location. Refresh the preview and retry.", plan}};
                        try {
                            const sourceManifest = await this.bundleReader.readManifest(sourceDir);
                            const sourceMode = sourceManifest.modes.find((entry) => entry.modeName === modeName);
                            if (sourceMode?.generator === undefined) return {status: "terminal", view: {status: "load-error", error: `The prepared reusable Outcome Library does not contain generated provenance for mode "${modeName}". Regenerate that mode before reusing it.`, plan}};
                            const modes: OutcomeLibraryBundleModeInput<string>[] = [];
                            for (const entry of sourceManifest.modes) {
                                const library = await this.bundleReader.readLibrary(sourceDir, entry.modeName);
                                modes.push({modeName: entry.modeName, libraryId: library.libraryId, schemaVersion: library.schemaVersion, outcomes: library.outcomes, ...(entry.generator === undefined ? {} : {generator: entry.generator})});
                            }
                            return {status: "ready", modes, libraryId: sourceMode.libraryId, generator: sourceMode.generator};
                        } catch (error) {
                            return {status: "terminal", view: {status: "load-error", error: `Could not reopen the prepared reusable Outcome Library at "${sourceDir}": ${error instanceof Error ? error.message : String(error)}`, plan}};
                        }
                    }
                    if (!plan.steps.some((step) => step.kind === "generateOutcomeLibrary")) {
                        return {status: "terminal", view: {status: "load-error", error: "The prepared conversion has no executable Outcome Library generation or reuse step. Refresh the preview and retry.", plan}};
                    }
                    let game: PokieGame;
                    try {
                        game = await this.loadGame(projectRoot);
                    } catch (error) {
                        return {status: "terminal", view: {status: "load-error", error: error instanceof Error ? error.message : String(error), plan}};
                    }
                    const manifest = game.getManifest();
                    const configHash = request.configHash ?? game.getConfigHash?.();
                    const libraryId = request.libraryId ?? `${manifest.id}${request.mode !== undefined ? `-${request.mode}` : ""}`;
                    let generated: GenerateExactWeightedOutcomeLibraryResult;
                    try {
                        generated = await this.generateLibrary({
                            libraryId, game, pokieVersion: this.pokieVersion,
                            ...(configHash !== undefined ? {configHash} : {}),
                            ...(request.mode !== undefined ? {mode: request.mode} : {}),
                            ...(request.stake !== undefined ? {stake: request.stake} : {}),
                            generation,
                            ...(request.maxOutcomeSpaceSize !== undefined ? {maxExactOutcomeSpaceSize: request.maxOutcomeSpaceSize} : {}),
                            ...(sample === undefined ? {} : {sample}),
                        });
                    } catch (error) {
                        if (error instanceof WeightedOutcomeLibraryGenerationError) {
                            return {status: "terminal", view: error.getCode() === "weighted-outcome-library-generation-unsupported"
                                ? {status: "unsupported", error: error.message, plan}
                                : {status: "generation-error", code: error.getCode(), error: error.message, plan}};
                        }
                        throw error;
                    }
                    const otherModes = await this.readOtherModes(resolvedOutDir.resolvedPath, modeName);
                    if (otherModes.status === "error") return {status: "terminal", view: {status: "load-error", error: otherModes.message, plan}};
                    return {
                        status: "ready",
                        modes: [...otherModes.modes, {modeName, libraryId, schemaVersion: generated.library.schemaVersion, outcomes: generated.library.outcomes, generator: generated.diagnostics}],
                        libraryId,
                        generator: generated.diagnostics,
                    };
                },
                canPublish: (read) => read.status === "ready",
                assertDestinationAvailable: async () => {
                    const current = await this.planning.prepare(projectRoot, "outcomeLibrary", resolvedOutDir.resolvedPath, requestedGeneration);
                    if (current.status !== "planned") throw new Error(current.diagnostic?.message ?? "The Outcome Library destination is unavailable.");
                },
                publish: (read) => {
                    if (read.status !== "ready") throw new Error("The prepared Outcome Library generation was not publishable.");
                    return this.writer.writeToDirectory(read.modes, resolvedOutDir.resolvedPath);
                },
                register: (writeResult) => {
                    if (writeResult.manifest !== undefined && !writeResult.issues.some((issue) => issue.severity === "error")) this.recordDiscoveredBundleDir(projectRoot, outDirRelative);
                },
            });
            if (!execution.published) return execution.read.status === "terminal" ? execution.read.view : {status: "load-error", error: "The prepared Outcome Library generation was not publishable.", plan};
            const writeResult = execution.publication!;
            const errors = writeResult.issues.filter((issue) => issue.severity === "error");
            if (errors.length > 0 || writeResult.manifest === undefined) {
                return {status: "invalid", errors, warnings: writeResult.issues.filter((issue) => issue.severity !== "error"), plan};
            }

            const modeEntry = writeResult.manifest.modes.find((entry) => entry.modeName === modeName);
            if (modeEntry === undefined) {
            // Guaranteed present by the writer whenever it returns a manifest at all (one entry per input
            // mode that didn't itself error) -- reachable only if the writer's own contract changes.
                return {status: "load-error", error: `The bundle write to "${outDirRelative}" did not report mode "${modeName}".`, plan};
            }

            const read = execution.read;
            if (read.status !== "ready") return {status: "load-error", error: "The prepared Outcome Library generation lost its publishable source.", plan};
            const coverage = read.generator.strategy === "exact" ? 1 : toNumberApprox(read.generator.sampledRawCount) / toNumberApprox(read.generator.totalOutcomeSpaceSize);

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
                generator: read.generator,
                coverage,
                selector: {kind: "bundle", bundleDir: outDirRelative, modeName},
                plan,
            };
        } catch (error) {
            return {status: "load-error", error: error instanceof Error ? error.message : String(error), plan};
        }
    }

    // The Registry's own "does a compatible library already exist for this build?" check -- see
    // StudioOutcomeLibraryRegistryView's own doc comment for what "compatible"/"stale"/"wrong"/"missing"
    // mean here. Never limited to the conventional DEFAULT_BUNDLE_DIR: every bundle directory generate()
    // has ever written to for this project, DEFAULT_BUNDLE_DIR included, is read (see
    // discoverBundleDirs's own doc comment) -- persisted on disk, so this keeps finding a caller-chosen
    // outDir's library even from a brand-new StudioOutcomeLibraryGenerateService/Studio server process, not
    // only the one that generated it. For each mode name encountered anywhere, only the most recently
    // generated occurrence of it is kept -- so a mode regenerated into a fresh caller-chosen outDir is
    // reported from there, while a different mode still sitting untouched in an earlier bundle dir keeps
    // being reported from that one.
    public async registry(projectRoot: string): Promise<StudioOutcomeLibraryRegistryView> {
        let game: PokieGame;
        try {
            game = await this.loadGame(projectRoot);
        } catch (error) {
            return {status: "load-error", error: error instanceof Error ? error.message : String(error)};
        }
        const currentGame = game.getManifest();

        const discovered: {bundleDir: string; manifest: OutcomeLibraryBundleManifest}[] = [];
        for (const bundleDir of this.discoverBundleDirs(projectRoot)) {
            const resolved = resolveProjectDirectory(projectRoot, bundleDir, this.realpath);
            if (resolved.status === "error") {
                return {status: "load-error", error: resolved.message};
            }
            if (!this.directoryExists(resolved.resolvedPath)) {
                continue;
            }

            let manifest: OutcomeLibraryBundleManifest;
            try {
                manifest = await this.bundleReader.readManifest(resolved.resolvedPath);
            } catch (error) {
                return {
                    status: "load-error",
                    error: `Could not read the outcome library bundle at "${bundleDir}": ${error instanceof Error ? error.message : String(error)}`,
                };
            }
            discovered.push({bundleDir, manifest});
        }

        if (discovered.length === 0) {
            return {status: "ok", bundleDir: StudioOutcomeLibraryGenerateService.DEFAULT_BUNDLE_DIR, buildStatus: "missing"};
        }

        const currentConfigHash = game.getConfigHash?.();
        const classify = (manifest: OutcomeLibraryBundleManifest): "compatible" | "stale" | "wrong" => {
            if (manifest.game.id !== currentGame.id) {
                return "wrong";
            }
            if (manifest.game.version !== currentGame.version || manifest.artifactPokieVersion !== this.pokieVersion) {
                return "stale";
            }
            // Game id/version are user-authored metadata and commonly stay unchanged while a
            // Blueprint's reels, pays, or mechanics change. A library without the current runtime's
            // exact configuration hash therefore cannot be presented as usable for this Project.
            if (currentConfigHash !== undefined && manifest.configHash !== currentConfigHash) {
                return "stale";
            }
            return "compatible";
        };

        type ModeCandidate = {bundleDir: string; manifest: OutcomeLibraryBundleManifest; entry: OutcomeLibraryBundleManifest["modes"][number]};
        const latestByMode = new Map<string, ModeCandidate>();
        for (const {bundleDir, manifest} of discovered) {
            for (const entry of manifest.modes) {
                const generatedAt = entry.generator?.generatedAt ?? manifest.generatedAt;
                const existing = latestByMode.get(entry.modeName);
                if (existing === undefined || generatedAt > (existing.entry.generator?.generatedAt ?? existing.manifest.generatedAt)) {
                    latestByMode.set(entry.modeName, {bundleDir, manifest, entry});
                }
            }
        }

        // The top-level game/version/buildStatus snapshot mirrors whichever discovered bundle was itself
        // generated most recently overall -- the Registry panel's own badge/"compatible with the current
        // build" summary, while each mode's own buildStatus below (evaluated against its own source
        // bundle) is what actually drives per-mode correctness.
        const primary = discovered.reduce((latest, candidate) => (candidate.manifest.generatedAt > latest.manifest.generatedAt ? candidate : latest));

        return {
            status: "ok",
            bundleDir: primary.bundleDir,
            buildStatus: classify(primary.manifest),
            game: primary.manifest.game,
            currentGame,
            ...(primary.manifest.configHash !== undefined ? {configHash: primary.manifest.configHash} : {}),
            artifactPokieVersion: primary.manifest.artifactPokieVersion,
            currentPokieVersion: this.pokieVersion,
            generatedAt: primary.manifest.generatedAt,
            modes: Array.from(latestByMode.values()).map(({bundleDir, manifest, entry}) => ({
                modeName: entry.modeName,
                libraryId: entry.libraryId,
                bundleDir,
                buildStatus: classify(manifest),
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

    // registry()'s own discovery set: DEFAULT_BUNDLE_DIR (always checked, generated into or not) plus
    // every project-relative outDir the persisted registry index (see REGISTRY_INDEX_RELATIVE_PATH) has
    // recorded a successful generate() into, for this project, across every Studio server process that has
    // ever run against it. Deduplicated; DEFAULT_BUNDLE_DIR sorts first when also present in the index.
    private discoverBundleDirs(projectRoot: string): string[] {
        return Array.from(new Set([StudioOutcomeLibraryGenerateService.DEFAULT_BUNDLE_DIR, ...this.readRegistryIndex(projectRoot)]));
    }

    // Reads the persisted list of project-relative bundle directories generate() has ever successfully
    // written to for this project. Deliberately fails open rather than surfacing a load-error: this index
    // is a discovery aid only, never the source of truth for what a bundle actually contains (registry()'s
    // own manifest read of each directory is), so a missing file (nothing generated into a custom outDir
    // yet, or an older bundle predating this index), a corrupt one, or a symlink escape under the project
    // root all simply fall back to reporting an empty list of *additional* dirs -- DEFAULT_BUNDLE_DIR
    // itself is always still checked directly by discoverBundleDirs. Each individual parsed entry is
    // likewise validated as a safe, project-contained, non-symlink-escaping *directory* (the same
    // containment check registry() itself applies before reading a directory, plus an actual on-disk
    // isDirectory() check -- fs.existsSync alone would also be true for a plain file) and silently dropped
    // if it isn't -- an entry hand-edited or corrupted into an absolute path, a ".."-style escape, a
    // symlink escape, a blank string (which resolves to the project root itself, an existing directory but
    // never a bundle), or a project-contained file must never be allowed to reach registry() and make it
    // report a load-error for the *entire* index, which would block discovery of every other, still-valid
    // entry alongside it.
    private readRegistryIndex(projectRoot: string): string[] {
        const resolved = resolveProjectDirectory(projectRoot, StudioOutcomeLibraryGenerateService.REGISTRY_INDEX_RELATIVE_PATH, this.realpath);
        if (resolved.status === "error" || !this.directoryExists(resolved.resolvedPath)) {
            return [];
        }
        try {
            const parsed: unknown = JSON.parse(this.readTextFile(resolved.resolvedPath));
            if (!Array.isArray(parsed)) {
                return [];
            }
            return parsed.filter((entry): entry is string => {
                if (typeof entry !== "string" || entry.trim().length === 0) {
                    return false;
                }
                const resolvedEntry = resolveProjectDirectory(projectRoot, entry, this.realpath);
                return resolvedEntry.status === "ok" && this.isDirectory(resolvedEntry.resolvedPath);
            });
        } catch {
            return [];
        }
    }

    // Persists `bundleDir` into the project-scoped registry index (creating it, and its parent directory,
    // on first use) so a later registry() call -- from this same service instance or a fresh one entirely,
    // e.g. after a Studio server restart -- still discovers it. Holds only directory names, never outcome
    // data itself (see REGISTRY_INDEX_RELATIVE_PATH's own doc comment), and is deliberately best-effort:
    // called after generate()'s own bundle write has already succeeded, so a failure to persist discovery
    // (a read-only project checkout, an unresolvable index path) must not turn that already-successful
    // generate() into a reported failure -- it only means this one library stays discoverable exclusively
    // from within the current process, same as before this index existed.
    private recordDiscoveredBundleDir(projectRoot: string, bundleDir: string): void {
        try {
            const resolved = resolveProjectDirectory(projectRoot, StudioOutcomeLibraryGenerateService.REGISTRY_INDEX_RELATIVE_PATH, this.realpath);
            if (resolved.status === "error") {
                return;
            }
            const existing = this.readRegistryIndex(projectRoot);
            if (existing.includes(bundleDir)) {
                return;
            }
            this.ensureDirectory(path.dirname(resolved.resolvedPath));
            this.writeTextFile(resolved.resolvedPath, JSON.stringify([...existing, bundleDir]));
        } catch {
            // Best-effort persistence -- see this method's own doc comment.
        }
    }
}
