import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import v8 from "v8";
import {buildRoundArtifactFromSession} from "../../artifact/buildRoundArtifactFromSession.js";
import type {RoundArtifact} from "../../artifact/RoundArtifact.js";
import type {RoundArtifactProvenance} from "../../artifact/RoundArtifactProvenance.js";
import type {PokieGame} from "../../gamepackage/PokieGame.js";
import {determineStakeAmount} from "../../server/session/determineStakeAmount.js";
import {SeededWeightedOutcomeRandomSource} from "../../pregenerated/SeededWeightedOutcomeRandomSource.js";
import type {ValidationRule} from "../../validation/ValidationRule.js";
import {buildWeightedOutcomeLibrary, type WeightedOutcomeInput} from "../buildWeightedOutcomeLibrary.js";
import {compareIds} from "../internal/compareIds.js";
import type {WeightedOutcomeLibrary} from "../WeightedOutcomeLibrary.js";
import {accumulateUniqueGridWeights, type UniqueGridWeightEntry} from "./internal/accumulateUniqueGridWeights.js";
import {computeExactEnumerationSourceId} from "./internal/computeExactEnumerationSourceId.js";
import {ForcedSymbolsCombinationsGenerator} from "./internal/ForcedSymbolsCombinationsGenerator.js";
import {supportsBetModeSelecting} from "../../session/videoslot/betmode/supportsBetModeSelecting.js";
import {sampleStopTuples} from "./internal/sampleStopTuples.js";
import {sweepStopTuples} from "./internal/sweepStopTuples.js";
import {toBigIntSafeDecimal} from "./internal/toBigIntSafeDecimal.js";
import type {OutcomeLibraryGeneratorDiagnostics, OutcomeLibraryGenerationStrategy} from "./OutcomeLibraryGeneratorDiagnostics.js";
import {WeightedOutcomeLibraryGenerationCancelledError, type ExactEnumerationCheckpoint} from "./WeightedOutcomeLibraryGenerationCancelledError.js";
import {WeightedOutcomeLibraryGenerationError} from "./WeightedOutcomeLibraryGenerationError.js";
import {
    adaptLegacyOutcomeLibraryGenerationRequest,
    type OutcomeLibraryGenerationRequest,
    prepareOutcomeLibraryGeneration,
} from "./OutcomeLibraryGenerationRequest.js";

// Above this raw reel-stop combination count, generation refuses to sweep exhaustively unless the caller
// either raises maxOutcomeSpaceSize explicitly or opts into "bounded" -- chosen as a size any single Node
// process can sweep (with dedup) in well under a minute for a typical grid, not a hard platform limit.
export {DEFAULT_MAX_EXACT_OUTCOME_SPACE_SIZE} from "./OutcomeLibraryGenerationRequest.js";

// A wide/many-reel grid can have so little raw-combination duplication that the distinct-grid count
// accumulateUniqueGridWeights retains approaches maxOutcomeSpaceSize itself -- i.e. staying under
// maxOutcomeSpaceSize does NOT, on its own, bound memory the way the comment above assumes for "a typical
// grid". Rather than trying to predict that in advance (accurately requires the reel/symbol distribution
// this function doesn't have until it has already swept), this is a runtime safety net: an 85%-of-heap-limit
// ceiling any generate run defaults to, so a run that is genuinely going to exhaust memory fails closed with
// a clean, actionable WeightedOutcomeLibraryGenerationError (see accumulateUniqueGridWeights) instead of an
// uncatchable V8 "JavaScript heap out of memory" process abort.
const HEAP_SAFETY_FRACTION = 0.85;
// Exact enumeration can legitimately reach hundreds of thousands of distinct
// grids. Keep that identity set on disk, partitioned by the same digest prefix
// used by the canonical outcome id, so only one small sorted partition is live
// while artifacts are constructed and published.
const EXTERNAL_GRID_BUCKETS = 256;
const EXTERNAL_YIELD_EVERY = BigInt(5000);

function defaultHeapUsedLimitBytes(): number {
    return v8.getHeapStatistics().heap_size_limit * HEAP_SAFETY_FRACTION;
}

export type BoundedCoverageGenerationOptions = {
    // How many independent reel-stop draws to sample (with replacement) through the real calculation path.
    readonly sampleSize: bigint;
    // Deterministic -- the same seed always draws the same sample, so a "bounded-coverage" library can be
    // reproduced exactly later (see OutcomeLibraryGeneratorDiagnostics.seed).
    readonly seed: string;
};

// The first-class sampled counterpart to exact generation.  Unlike `bounded`, this deliberately
// requests sampling even when the exact space would also fit below its safety cap: callers choose
// the cost and deterministic draw count up front, rather than asking generation to decide for them.
// `bounded` remains as the backwards-compatible "only sample above the exact cap" option.
export type SampledWeightedOutcomeLibraryOptions = {
    readonly sampleSize: bigint;
    readonly seed: string;
};

// PokieGame.createExactEnumerationSession is deliberately not generic (same convention as PokieGame.createSession
// itself) -- a game package's own symbol alphabet is always string-keyed at this boundary, the same way every
// other PokieGame-level API in this codebase is.
export type GenerateExactWeightedOutcomeLibraryOptions = {
    readonly libraryId: string;
    // The loaded, executable built package (see loadPokieGame) generation drives -- must implement
    // PokieGame.createExactEnumerationSession or generation fails closed with
    // WeightedOutcomeLibraryGenerationError("weighted-outcome-library-generation-unsupported").
    readonly game: PokieGame;
    readonly pokieVersion: string;
    readonly configHash?: string;
    readonly compatibilityPolicyVersion?: string;
    readonly betMode?: string;
    // Opt in only for callers that require the executable session itself to enact the requested mode.
    // The long-standing CLI/Studio generator also supports recording a caller-selected declarative mode on
    // packages whose exact session predates the runtime bet-mode decorator, so it intentionally leaves this
    // false. ArtifactBuilderRegistry sets it true for canonical Project -> Outcome/Stake conversion.
    readonly selectBetMode?: boolean;
    readonly stake?: number;
    /**
     * Canonical publication identity for callers which also publish this
     * result.  The generator remains side-effect free, but keeping this on
     * the legacy compatibility shape prevents a domain request from losing
     * its resolved destination while it crosses the old implementation.
     */
    readonly outputDestination?: string;
    readonly maxOutcomeSpaceSize?: bigint;
    // Records an explicit caller choice of the default exact strategy. It is mutually exclusive with
    // sampled choices at public command boundaries; exact generation otherwise remains the default.
    readonly exact?: boolean;
    // Explicit opt-in: only consulted once the space actually exceeds maxOutcomeSpaceSize. Its mere presence
    // never downgrades an otherwise-exact run -- a space within maxOutcomeSpaceSize is always swept exactly.
    readonly bounded?: BoundedCoverageGenerationOptions;
    // Explicit sampled generation: performs exactly sampleSize deterministic raw draws through the
    // canonical runtime path, without sweeping the complete reel-stop space first.  This is separate
    // from `bounded`, whose historical contract only takes effect once the exact cap is exceeded.
    readonly sampled?: SampledWeightedOutcomeLibraryOptions;
    // Resumes a previously-cancelled "exact" run from its own ExactEnumerationCheckpoint (see
    // WeightedOutcomeLibraryGenerationCancelledError.checkpoint) -- both the raw sweep position AND the
    // grid/weight accumulation already gathered up to that position are carried forward, so a chain of
    // cancel/resume calls over a single logical sweep merges into the exact same complete library an
    // uninterrupted sweep would have produced; nothing labelled "exact" is ever returned from a partial
    // portion of the space alone. Only valid when this run itself resolves to the "exact" strategy -- passing
    // it alongside a space that now requires "bounded-coverage" fails closed instead of silently discarding
    // it, and so does a checkpoint whose own progressTotal doesn't match this run's outcome space size, or
    // whose sourceEnumerationId (see computeExactEnumerationSourceId) doesn't match this run's own game/
    // config/reel-layout -- two games or configs can coincidentally share the same raw outcome-space size, so
    // progressTotal alone is never enough to trust a checkpoint's accumulated grids.
    readonly resumeFrom?: ExactEnumerationCheckpoint;
    readonly signal?: AbortSignal;
    readonly onProgress?: (processedRawIndex: bigint, progressTotal: bigint) => void;
    readonly artifactValidator?: ValidationRule<RoundArtifact>;
    readonly now?: () => Date;
    // Runtime memory safety net for the accumulation phase (see accumulateUniqueGridWeights and
    // HEAP_SAFETY_FRACTION above) -- both default to real values (an 85%-of-heap-limit ceiling, real
    // process.memoryUsage().heapUsed), so every caller gets this protection with no extra wiring. Pass
    // heapUsedLimitBytes: Infinity to disable it explicitly (e.g. a caller that already runs generation in
    // its own dedicated, resource-limited worker/process and wants that to be the only guard).
    readonly heapUsedLimitBytes?: number;
    readonly getHeapUsedBytes?: () => number;
};

export type GenerateExactWeightedOutcomeLibraryResult = {
    readonly library: WeightedOutcomeLibrary;
    readonly diagnostics: OutcomeLibraryGeneratorDiagnostics;
};

// The bundle writer needs the generator diagnostics only after it has consumed
// the outcome stream.  Keep that small terminal value separate from the
// outcomes themselves so a managed publication never has to retain a complete
// WeightedOutcomeLibrary merely to put provenance in its manifest.
export type StreamingExactWeightedOutcomes = {
    readonly outcomes: AsyncGenerator<WeightedOutcomeInput>;
    readonly getDiagnostics: () => OutcomeLibraryGeneratorDiagnostics | undefined;
};

/**
 * Executes the public domain request without making callers choose legacy
 * `exact`/`bounded`/`sampled` option names. CLI, Studio, and managed builders
 * may keep accepting their historical syntax, but must translate it to this
 * request before crossing the domain boundary.
 */
export function generateWeightedOutcomeLibrary(
    request: OutcomeLibraryGenerationRequest,
): Promise<GenerateExactWeightedOutcomeLibraryResult> {
    return generateExactWeightedOutcomeLibrary(legacyOptionsForRequest(request));
}

/** The streaming counterpart to generateWeightedOutcomeLibrary for bundle publishers. */
export function generateStreamingWeightedOutcomeLibrary(
    request: OutcomeLibraryGenerationRequest,
): StreamingExactWeightedOutcomes {
    return createStreamingExactWeightedOutcomes(legacyOptionsForRequest(request));
}

function legacyOptionsForRequest(
    request: OutcomeLibraryGenerationRequest,
): GenerateExactWeightedOutcomeLibraryOptions {
    const prepared = prepareOutcomeLibraryGeneration(request);
    return {
        libraryId: prepared.libraryId,
        game: prepared.game,
        pokieVersion: prepared.pokieVersion,
        ...(prepared.configHash === undefined ? {} : {configHash: prepared.configHash}),
        ...(prepared.compatibilityPolicyVersion === undefined ? {} : {compatibilityPolicyVersion: prepared.compatibilityPolicyVersion}),
        ...(prepared.mode === undefined ? {} : {betMode: prepared.mode}),
        ...(prepared.selectBetMode === undefined ? {} : {selectBetMode: prepared.selectBetMode}),
        ...(prepared.stake === undefined ? {} : {stake: prepared.stake}),
        ...(prepared.outputDestination === undefined ? {} : {outputDestination: prepared.outputDestination}),
        maxOutcomeSpaceSize: prepared.maxExactOutcomeSpaceSize,
        ...(prepared.generation === "exact" ? {exact: true} : {}),
        ...(prepared.generation === "sampled" ? {sampled: prepared.sample!} : {}),
        ...(prepared.generation === "bounded" ? {bounded: prepared.sample!} : {}),
        ...(prepared.resumeFrom === undefined ? {} : {resumeFrom: prepared.resumeFrom}),
        ...(prepared.signal === undefined ? {} : {signal: prepared.signal}),
        ...(prepared.onProgress === undefined ? {} : {onProgress: prepared.onProgress}),
        ...(prepared.artifactValidator === undefined ? {} : {artifactValidator: prepared.artifactValidator}),
        ...(prepared.now === undefined ? {} : {now: prepared.now}),
        ...(prepared.heapUsedLimitBytes === undefined ? {} : {heapUsedLimitBytes: prepared.heapUsedLimitBytes}),
        ...(prepared.getHeapUsedBytes === undefined ? {} : {getHeapUsedBytes: prepared.getHeapUsedBytes}),
    };
}

type PreparedGeneration = {
    readonly strategy: OutcomeLibraryGenerationStrategy;
    /** The request-resolved cap, retained in the output diagnostics. */
    readonly maxExactOutcomeSpaceSize: bigint;
    readonly totalOutcomeSpaceSize: bigint;
    readonly progressTotal: bigint;
    readonly reelWindows: string[][][];
    readonly tuples: Generator<{tuple: number[]; rawIndex: bigint}>;
    readonly sourceEnumerationId: string;
    /** Resolved by the shared request preparation, never a raw caller assertion. */
    readonly configHash?: string;
    readonly initialGrids?: ReadonlyMap<string, UniqueGridWeightEntry<string>>;
    readonly initialProcessedRawCount?: bigint;
};

function prepare(options: GenerateExactWeightedOutcomeLibraryOptions): PreparedGeneration {
    const {game} = options;
    const manifest = game.getManifest();
    const request = prepareOutcomeLibraryGeneration(adaptLegacyOutcomeLibraryGenerationRequest(options));
    // prepareOutcomeLibraryGeneration has already failed closed for this case; retain the local narrowing
    // because the executable session is consumed below as part of this function's runtime boundary.
    if (typeof game.createExactEnumerationSession !== "function") {
        throw new WeightedOutcomeLibraryGenerationError("weighted-outcome-library-generation-unsupported", `"${manifest.id}" does not implement createExactEnumerationSession(); its outcome space cannot be exactly enumerated.`);
    }
    const {estimate, strategy, requiresSampledOptIn} = request.preflight;
    const sampled = request.sample;
    if (requiresSampledOptIn) {
        throw new WeightedOutcomeLibraryGenerationError(
            "weighted-outcome-library-generation-space-exceeded",
            `"${manifest.id}"'s exact outcome space (${estimate.totalOutcomeSpaceSize} reel-stop combinations) exceeds ` +
                `maxOutcomeSpaceSize (${request.maxExactOutcomeSpaceSize}). Pass a larger maxOutcomeSpaceSize, or opt into an explicitly-labelled ` +
                'bounded-coverage strategy with `pokie generate <packageRoot> --sample <n> --seed <string>` or `pokie build <project> --target outcomeLibrary --sample <n> --seed <string>` (or the `sampled` option).',
        );
    }

    if (options.resumeFrom !== undefined && strategy !== "exact") {
        throw new WeightedOutcomeLibraryGenerationError(
            "weighted-outcome-library-generation-checkpoint-unsupported",
            `"${manifest.id}"'s outcome space now resolves to the "${strategy}" strategy, which has no resumable raw sweep ` +
                "position to continue from; resumeFrom is only valid for a run that itself resolves to \"exact\".",
        );
    }
    if (options.resumeFrom?.restartRequired) {
        throw new WeightedOutcomeLibraryGenerationError(
            "weighted-outcome-library-generation-checkpoint-unsupported",
            "This exact generation was cancelled while using bounded disk staging, so its temporary grid accumulator was safely discarded. Retry the command from the beginning; this checkpoint cannot be resumed without changing exact weights.",
        );
    }
    if (options.resumeFrom?.externalStagingDirectory !== undefined) {
        throw new WeightedOutcomeLibraryGenerationError(
            "weighted-outcome-library-generation-checkpoint-unsupported",
            "This exact generation checkpoint depends on external disk staging, which is not a durable resume contract. Retry the command from the beginning; resuming it could omit already swept exact weights.",
        );
    }
    if (options.resumeFrom !== undefined && options.resumeFrom.progressTotal !== estimate.totalOutcomeSpaceSize) {
        throw new WeightedOutcomeLibraryGenerationError(
            "weighted-outcome-library-generation-checkpoint-mismatch",
            `resumeFrom's own progressTotal (${options.resumeFrom.progressTotal}) does not match "${manifest.id}"'s current ` +
                `exact outcome space size (${estimate.totalOutcomeSpaceSize}); it must come from a WeightedOutcomeLibraryGenerationCancelledError ` +
                "raised by this same game/config's own exact sweep.",
        );
    }

    // A throwaway probe (its own forced grid is never played) reads the reel strips once, off the exact same
    // executable session type generation later plays for real -- so reelWindows below is guaranteed to match
    // what createExactEnumerationSession actually enumerates over, never a second, independently-derived view.
    const probe = game.createExactEnumerationSession(new ForcedSymbolsCombinationsGenerator<string>([]));
    const sequences = probe.getSymbolsSequences();
    const reelsSymbolsNumber = probe.getReelsSymbolsNumber();
    const reelWindows: string[][][] = sequences.map((sequence) =>
        Array.from({length: sequence.getSize()}, (_unused, position) => sequence.getSymbols(position, reelsSymbolsNumber)),
    );
    const reelSizes = sequences.map((sequence) => sequence.getSize());
    const sourceEnumerationId = computeExactEnumerationSourceId(manifest.id, request.configHash, reelWindows);

    // Same cardinality alone never proves a checkpoint belongs to THIS sweep -- two different games/configs
    // can coincidentally enumerate the exact same raw combination count while their actual reel layouts (and
    // therefore the grids/weights a checkpoint accumulated) are completely incompatible. Checked here, before
    // any of resumeFrom.grids is ever merged into this run's own accumulation.
    if (options.resumeFrom !== undefined && options.resumeFrom.sourceEnumerationId !== sourceEnumerationId) {
        throw new WeightedOutcomeLibraryGenerationError(
            "weighted-outcome-library-generation-checkpoint-mismatch",
            `resumeFrom's own sourceEnumerationId does not match "${manifest.id}"'s current game/config/reel-layout identity, even ` +
                "though its progressTotal happens to match; it must come from a WeightedOutcomeLibraryGenerationCancelledError raised " +
                "by this same game/config's own exact sweep, not merely one with the same outcome-space size.",
        );
    }

    if (strategy === "exact") {
        return {
            strategy,
            maxExactOutcomeSpaceSize: request.maxExactOutcomeSpaceSize,
            totalOutcomeSpaceSize: estimate.totalOutcomeSpaceSize,
            progressTotal: estimate.totalOutcomeSpaceSize,
            reelWindows,
            tuples: sweepStopTuples(reelSizes, options.resumeFrom?.processedRawIndex ?? BigInt(0)),
            sourceEnumerationId,
            ...(request.configHash === undefined ? {} : {configHash: request.configHash}),
            ...(options.resumeFrom !== undefined
                ? {initialGrids: options.resumeFrom.grids, initialProcessedRawCount: options.resumeFrom.processedRawIndex}
                : {}),
        };
    }

    const bounded = sampled as BoundedCoverageGenerationOptions;
    return {
        strategy,
        maxExactOutcomeSpaceSize: request.maxExactOutcomeSpaceSize,
        totalOutcomeSpaceSize: estimate.totalOutcomeSpaceSize,
        progressTotal: bounded.sampleSize,
        reelWindows,
        tuples: sampleStopTuples(reelSizes, bounded.sampleSize, new SeededWeightedOutcomeRandomSource(bounded.seed)),
        sourceEnumerationId,
        ...(request.configHash === undefined ? {} : {configHash: request.configHash}),
    };
}

function outcomeIdForGrid(gridKey: string): string {
    return `outcome-${crypto.createHash("sha256").update(gridKey).digest("hex").slice(0, 16)}`;
}

function toSafeWeightNumber(weight: bigint, id: string): number {
    if (weight > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new WeightedOutcomeLibraryGenerationError(
            "weighted-outcome-library-generation-weight-not-representable",
            `outcome "${id}"'s exact combinatorial weight (${weight}) exceeds Number.MAX_SAFE_INTEGER and cannot be represented as WeightedOutcome.weight.`,
        );
    }
    return Number(weight);
}

// The core, reusable public producer: an executable built package (a loaded PokieGame -- see loadPokieGame) to
// a canonical WeightedOutcomeLibrary, exact whenever the game's own reel-stop space is finite and within
// bounds, and only ever an explicitly-labelled "bounded-coverage" sample otherwise (see
// GenerateExactWeightedOutcomeLibraryOptions.bounded) -- never silently downgraded and never mislabeled.
//
// Every outcome is built by driving the SAME session/win-calculation runtime a live round uses --
// PokieGame.createExactEnumerationSession's own concrete VideoSlotSessionHandling, played for real via
// play() -- with only its randomness-backed SymbolsCombinationsGenerating swapped for a deterministic,
// forced one (see ForcedSymbolsCombinationsGenerator); no second calculation path exists anywhere in this
// module. Distinct reel-stop tuples that render the same visible grid are deduplicated (mirroring
// SymbolsCombinationsAnalyzer.getUniqueCombinationsWithWeights's own "dedupe before the expensive
// win-calculation step" optimization -- see math-modeling.md) and their exact integer counts summed as
// bigint before ever crossing into a `number`-typed WeightedOutcome.weight, so a count that would silently
// lose precision fails fast (weighted-outcome-library-generation-weight-not-representable) instead of
// quietly rounding. The resulting outcomes are handed to buildWeightedOutcomeLibrary unchanged, so
// homogeneous provenance/betMode/stake, JSON-safety, and every other existing invariant are still checked by
// that one real builder, never re-implemented here.
export async function *streamExactWeightedOutcomes(
    options: GenerateExactWeightedOutcomeLibraryOptions,
): AsyncGenerator<WeightedOutcomeInput, OutcomeLibraryGeneratorDiagnostics> {
    return yield* streamExactWeightedOutcomesInternal(options, true);
}

/**
 * Public publishers use disk partitions so that a distinct-outcome workload
 * never retains its whole grid set.  The legacy materialising API keeps its
 * original in-memory checkpoint contract: it is the only caller that can
 * actually retain a resumable checkpoint without also retaining an external
 * staging directory after its caller has gone away.
 */
async function *streamExactWeightedOutcomesInternal(
    options: GenerateExactWeightedOutcomeLibraryOptions,
    useExternalStaging: boolean,
): AsyncGenerator<WeightedOutcomeInput, OutcomeLibraryGeneratorDiagnostics> {
    const {game} = options;
    const manifest = game.getManifest();
    const prepared = prepare(options);

    const provenance: RoundArtifactProvenance = {
        game: manifest,
        pokieVersion: options.pokieVersion,
        ...(prepared.configHash !== undefined ? {configHash: prepared.configHash} : {}),
    };

    const createOutcome = (id: string, entry: UniqueGridWeightEntry<string>): WeightedOutcomeInput => {
        // Guaranteed non-null by prepare(): a game whose createExactEnumerationSession was undefined would
        // already have thrown before this point.
        const session = game.createExactEnumerationSession!(new ForcedSymbolsCombinationsGenerator<string>(entry.grid));
        if (options.selectBetMode && options.betMode !== undefined) {
            if (!supportsBetModeSelecting(session)) {
                throw new WeightedOutcomeLibraryGenerationError(
                    "weighted-outcome-library-generation-bet-mode-unsupported",
                    `"${manifest.id}" cannot exactly enumerate bet mode "${options.betMode}" because its exact-enumeration session does not support bet-mode selection.`,
                );
            }
            session.setBetMode(options.betMode);
        }
        if (!session.canPlayNextGame()) {
            throw new WeightedOutcomeLibraryGenerationError(
                "weighted-outcome-library-generation-session-not-playable",
                `"${manifest.id}"'s createExactEnumerationSession() returned a session that cannot play a round ` +
                    `(bet ${session.getBet()} > credits ${session.getCreditsAmount()}); it must return a session with enough credits for one round.`,
            );
        }
        // The stake belongs to the paid entry spin. A free-games session reports the stake for its
        // *next* spin, which becomes zero immediately after this spin awards free games, so capture it
        // before play() changes that state and pass it through to the artifact explicitly.
        const stake = options.stake ?? determineStakeAmount(session, session.getBet());
        session.play();

        const artifact = buildRoundArtifactFromSession(session, {
            roundId: id,
            provenance,
            ...(options.betMode !== undefined ? {betMode: options.betMode} : {}),
            stake,
        });

        return {id, weight: toSafeWeightNumber(entry.weight, id), artifact};
    };

    let processedRawCount: bigint;
    // Resume checkpoints deliberately retain their historical in-memory
    // representation. A streaming publisher must never silently discard that
    // seeded prefix: use the materialising compatibility path for a valid
    // legacy checkpoint, and disk partitions only for fresh exact publication
    // (the normal public CLI/Studio path).
    if (prepared.strategy === "exact" && useExternalStaging && prepared.initialProcessedRawCount === undefined) {
        const external = externallyAccumulateExactGridWeights(prepared.reelWindows, prepared.tuples, prepared.progressTotal, {
            signal: options.signal,
            onProgress: options.onProgress,
            sourceEnumerationId: prepared.sourceEnumerationId,
            ...(prepared.initialProcessedRawCount === undefined ? {} : {initialProcessedRawCount: prepared.initialProcessedRawCount}),
        });
        let step = await external.next();
        while (!step.done) {
            yield createOutcome(step.value.id, step.value.entry);
            step = await external.next();
        }
        processedRawCount = step.value;
    } else {
        const {grids, processedRawCount: accumulatedRawCount} = await accumulateUniqueGridWeights<string>(prepared.reelWindows, prepared.tuples, prepared.progressTotal, {
            signal: options.signal,
            onProgress: options.onProgress,
            initialGrids: prepared.initialGrids,
            initialProcessedRawCount: prepared.initialProcessedRawCount,
            sourceEnumerationId: prepared.sourceEnumerationId,
            heapUsedLimitBytes: options.heapUsedLimitBytes ?? defaultHeapUsedLimitBytes(),
            getHeapUsedBytes: options.getHeapUsedBytes ?? (() => process.memoryUsage().heapUsed),
        });
        const sortedUniqueGrids = Array.from(grids.entries())
            .map(([gridKey, entry]) => ({id: outcomeIdForGrid(gridKey), entry}))
            .sort((a, b) => compareIds(a.id, b.id));
        grids.clear();
        for (const {id, entry} of sortedUniqueGrids) {
            yield createOutcome(id, entry);
        }
        processedRawCount = accumulatedRawCount;
    }

    return {
        algorithm: "pokie-exact-reel-enumeration-v1",
        strategy: prepared.strategy,
        totalOutcomeSpaceSize: toBigIntSafeDecimal(prepared.totalOutcomeSpaceSize),
        sampledRawCount: toBigIntSafeDecimal(processedRawCount),
        maxExactOutcomeSpaceSize: toBigIntSafeDecimal(prepared.maxExactOutcomeSpaceSize),
        ...(prepared.strategy === "bounded-coverage" ? {seed: (options.sampled ?? options.bounded as BoundedCoverageGenerationOptions).seed} : {}),
        pokieVersion: options.pokieVersion,
        game: manifest,
        ...(prepared.configHash !== undefined ? {configHash: prepared.configHash} : {}),
        ...(options.compatibilityPolicyVersion === undefined ? {} : {compatibilityPolicyVersion: options.compatibilityPolicyVersion}),
        generatedAt: (options.now ?? (() => new Date()))().toISOString(),
    };
}

/**
 * Spills raw grid keys into digest partitions, then deduplicates and sorts one
 * partition at a time. The SHA-256 prefix is also the first part of an
 * outcome id, therefore traversing buckets in numeric order preserves the
 * writer's required canonical id ordering without retaining a global sort.
 */
async function *externallyAccumulateExactGridWeights(
    reelWindows: readonly string[][][],
    tuples: Generator<{tuple: number[]; rawIndex: bigint}>,
    progressTotal: bigint,
    options: {
        readonly signal?: AbortSignal;
        readonly onProgress?: (processedRawIndex: bigint, progressTotal: bigint) => void;
        readonly sourceEnumerationId: string;
        readonly stagingDirectory?: string;
        readonly initialProcessedRawCount?: bigint;
    },
): AsyncGenerator<{readonly id: string; readonly entry: UniqueGridWeightEntry<string>}, bigint> {
    const stagingDir = options.stagingDirectory ?? fs.mkdtempSync(path.join(os.tmpdir(), "pokie-exact-grids-"));
    const descriptors = new Map<number, number>();
    let processedRawCount = options.initialProcessedRawCount ?? BigInt(0);
    let checkpointGrid: [string, UniqueGridWeightEntry<string>] | undefined;
    try {
        for (const {tuple, rawIndex} of tuples) {
            if (options.signal?.aborted) {
                // Disk partitions are an implementation detail of a streaming
                // publication.  They are not a durable checkpoint: a caller
                // can cancel after this generator yields but before it has
                // persisted any checkpoint.  Never expose their path as a
                // resumable token, otherwise publication cancellation leaves
                // an unreachable staging directory behind.
                throw new WeightedOutcomeLibraryGenerationCancelledError(rawIndex, progressTotal, new Map(checkpointGrid === undefined ? [] : [checkpointGrid]), options.sourceEnumerationId, true);
            }
            const grid = tuple.map((position, reelId) => reelWindows[reelId][position]);
            const gridKey = JSON.stringify(grid);
            checkpointGrid = [gridKey, {grid, weight: BigInt(1)}];
            const bucket = Number.parseInt(crypto.createHash("sha256").update(gridKey).digest("hex").slice(0, 2), 16);
            let descriptor = descriptors.get(bucket);
            if (descriptor === undefined) {
                descriptor = fs.openSync(path.join(stagingDir, `${bucket.toString(16).padStart(2, "0")}.jsonl`), "a");
                descriptors.set(bucket, descriptor);
            }
            fs.writeSync(descriptor, `${gridKey}\n`);
            processedRawCount++;
            if (processedRawCount % EXTERNAL_YIELD_EVERY === BigInt(0)) {
                options.onProgress?.(processedRawCount, progressTotal);
                await new Promise<void>((resolve) => {
                    setImmediate(resolve);
                });
            }
        }
        for (const descriptor of descriptors.values()) fs.closeSync(descriptor);
        descriptors.clear();
        options.onProgress?.(processedRawCount, progressTotal);

        for (let bucket = 0; bucket < EXTERNAL_GRID_BUCKETS; bucket++) {
            if (options.signal?.aborted) {
                throw new WeightedOutcomeLibraryGenerationCancelledError(processedRawCount, progressTotal, new Map(checkpointGrid === undefined ? [] : [checkpointGrid]), options.sourceEnumerationId, true);
            }
            const bucketPath = path.join(stagingDir, `${bucket.toString(16).padStart(2, "0")}.jsonl`);
            if (!fs.existsSync(bucketPath)) continue;
            const weights = new Map<string, UniqueGridWeightEntry<string>>();
            for (const line of fs.readFileSync(bucketPath, "utf-8").split("\n")) {
                if (line.length === 0) continue;
                const entry = weights.get(line);
                if (entry !== undefined) entry.weight += BigInt(1);
                else weights.set(line, {grid: JSON.parse(line) as string[][], weight: BigInt(1)});
            }
            const sorted = Array.from(weights.entries())
                .map(([gridKey, entry]) => ({id: outcomeIdForGrid(gridKey), entry}))
                .sort((left, right) => compareIds(left.id, right.id));
            weights.clear();
            for (const item of sorted) yield item;
        }
        return processedRawCount;
    } finally {
        for (const descriptor of descriptors.values()) fs.closeSync(descriptor);
        // A stream can be closed by a raw/bundle publisher after aborting,
        // without this generator ever throwing its own cancellation error.
        // In that case no checkpoint is observable or persistable.  Always
        // remove external partitions; callers receive an honest retry-only
        // cancellation instead of an orphaned pseudo-resume directory.
        fs.rmSync(stagingDir, {recursive: true, force: true});
    }
}

/**
 * Adapts the exact producer for a streaming bundle publisher.  `outcomes` is
 * consumed once by the writer; once that consumption completes,
 * `getDiagnostics` exposes the producer's small terminal diagnostic record.
 * It deliberately never collects outcomes or their artifacts in an array.
 */
export function createStreamingExactWeightedOutcomes(
    options: GenerateExactWeightedOutcomeLibraryOptions,
): StreamingExactWeightedOutcomes {
    const source = streamExactWeightedOutcomes(options);
    let diagnostics: OutcomeLibraryGeneratorDiagnostics | undefined;
    async function *captureDiagnostics(): AsyncGenerator<WeightedOutcomeInput> {
        let step = await source.next();
        while (!step.done) {
            yield step.value;
            step = await source.next();
        }
        diagnostics = step.value;
        return step.value;
    }
    return {outcomes: captureDiagnostics(), getDiagnostics: () => diagnostics};
}

// Convenience over streamExactWeightedOutcomes for the common case: collects the whole stream (still one
// unique outcome's artifact alive at a time while streaming -- see that function's own doc comment for what
// "bounded memory" actually means here) and hands it to buildWeightedOutcomeLibrary, so a caller who wants a
// full, already-validated WeightedOutcomeLibrary in memory never has to wire the collection loop themselves.
// A caller building a canonical outcome-library bundle instead should use streamExactWeightedOutcomes
// directly as an OutcomeLibraryBundleModeInput's own "outcomes" -- both are the exact same underlying
// generation, never two calculation paths.
export async function generateExactWeightedOutcomeLibrary(
    options: GenerateExactWeightedOutcomeLibraryOptions,
): Promise<GenerateExactWeightedOutcomeLibraryResult> {
    const stream = streamExactWeightedOutcomesInternal(options, false);
    const outcomes: WeightedOutcomeInput[] = [];
    let step = await stream.next();
    while (!step.done) {
        outcomes.push(step.value);
        step = await stream.next();
    }

    const library = buildWeightedOutcomeLibrary({
        libraryId: options.libraryId,
        outcomes,
        ...(options.artifactValidator !== undefined ? {artifactValidator: options.artifactValidator} : {}),
    });

    return {library, diagnostics: step.value};
}

// A named entry point for callers that intentionally want a bounded Monte-Carlo library rather
// than an exact enumeration.  `streamExactWeightedOutcomes` still supplies the only game/runtime
// calculation path: it samples exactly N reel-stop tuples (with replacement) and only then plays the
// distinct sampled grids.  It never sweeps the full outcome space before sampling.
export function generateSampledWeightedOutcomeLibrary(
    options: Omit<GenerateExactWeightedOutcomeLibraryOptions, "bounded" | "sampled"> & {readonly sampled: SampledWeightedOutcomeLibraryOptions},
): Promise<GenerateExactWeightedOutcomeLibraryResult> {
    return generateExactWeightedOutcomeLibrary(options);
}
