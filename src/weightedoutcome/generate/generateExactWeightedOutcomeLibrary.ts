import crypto from "crypto";
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
import {estimateExactOutcomeSpaceSize} from "./estimateExactOutcomeSpaceSize.js";
import type {OutcomeLibraryGeneratorDiagnostics, OutcomeLibraryGenerationStrategy} from "./OutcomeLibraryGeneratorDiagnostics.js";
import type {ExactEnumerationCheckpoint} from "./WeightedOutcomeLibraryGenerationCancelledError.js";
import {WeightedOutcomeLibraryGenerationError} from "./WeightedOutcomeLibraryGenerationError.js";

// Above this raw reel-stop combination count, generation refuses to sweep exhaustively unless the caller
// either raises maxOutcomeSpaceSize explicitly or opts into "bounded" -- chosen as a size any single Node
// process can sweep (with dedup) in well under a minute for a typical grid, not a hard platform limit.
export const DEFAULT_MAX_EXACT_OUTCOME_SPACE_SIZE = BigInt(20_000_000);

// A wide/many-reel grid can have so little raw-combination duplication that the distinct-grid count
// accumulateUniqueGridWeights retains approaches maxOutcomeSpaceSize itself -- i.e. staying under
// maxOutcomeSpaceSize does NOT, on its own, bound memory the way the comment above assumes for "a typical
// grid". Rather than trying to predict that in advance (accurately requires the reel/symbol distribution
// this function doesn't have until it has already swept), this is a runtime safety net: an 85%-of-heap-limit
// ceiling any generate run defaults to, so a run that is genuinely going to exhaust memory fails closed with
// a clean, actionable WeightedOutcomeLibraryGenerationError (see accumulateUniqueGridWeights) instead of an
// uncatchable V8 "JavaScript heap out of memory" process abort.
const HEAP_SAFETY_FRACTION = 0.85;

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
    readonly betMode?: string;
    // Opt in only for callers that require the executable session itself to enact the requested mode.
    // The long-standing CLI/Studio generator also supports recording a caller-selected declarative mode on
    // packages whose exact session predates the runtime bet-mode decorator, so it intentionally leaves this
    // false. ArtifactBuilderRegistry sets it true for canonical Project -> Outcome/Stake conversion.
    readonly selectBetMode?: boolean;
    readonly stake?: number;
    readonly maxOutcomeSpaceSize?: bigint;
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

type PreparedGeneration = {
    readonly strategy: OutcomeLibraryGenerationStrategy;
    readonly totalOutcomeSpaceSize: bigint;
    readonly progressTotal: bigint;
    readonly reelWindows: string[][][];
    readonly tuples: Generator<{tuple: number[]; rawIndex: bigint}>;
    readonly sourceEnumerationId: string;
    readonly initialGrids?: ReadonlyMap<string, UniqueGridWeightEntry<string>>;
    readonly initialProcessedRawCount?: bigint;
};

function prepare(options: GenerateExactWeightedOutcomeLibraryOptions): PreparedGeneration {
    const {game} = options;
    const manifest = game.getManifest();
    if (typeof game.createExactEnumerationSession !== "function") {
        throw new WeightedOutcomeLibraryGenerationError(
            "weighted-outcome-library-generation-unsupported",
            `"${manifest.id}" does not implement createExactEnumerationSession(); its outcome space cannot be exactly enumerated.`,
        );
    }

    const estimate = estimateExactOutcomeSpaceSize(game);
    const maxOutcomeSpaceSize = options.maxOutcomeSpaceSize ?? DEFAULT_MAX_EXACT_OUTCOME_SPACE_SIZE;
    const sampled = options.sampled ?? options.bounded;
    const strategy: OutcomeLibraryGenerationStrategy = options.sampled !== undefined || estimate.totalOutcomeSpaceSize > maxOutcomeSpaceSize ? "bounded-coverage" : "exact";

    if (strategy === "bounded-coverage" && sampled === undefined) {
        throw new WeightedOutcomeLibraryGenerationError(
            "weighted-outcome-library-generation-space-exceeded",
            `"${manifest.id}"'s exact outcome space (${estimate.totalOutcomeSpaceSize} reel-stop combinations) exceeds ` +
                `maxOutcomeSpaceSize (${maxOutcomeSpaceSize}). Pass a larger maxOutcomeSpaceSize, or opt into an explicitly-labelled ` +
                'bounded-coverage strategy via the "bounded" option.',
        );
    }

    if (options.resumeFrom !== undefined && strategy !== "exact") {
        throw new WeightedOutcomeLibraryGenerationError(
            "weighted-outcome-library-generation-checkpoint-unsupported",
            `"${manifest.id}"'s outcome space now resolves to the "${strategy}" strategy, which has no resumable raw sweep ` +
                "position to continue from; resumeFrom is only valid for a run that itself resolves to \"exact\".",
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
    const sourceEnumerationId = computeExactEnumerationSourceId(manifest.id, options.configHash, reelWindows);

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
            totalOutcomeSpaceSize: estimate.totalOutcomeSpaceSize,
            progressTotal: estimate.totalOutcomeSpaceSize,
            reelWindows,
            tuples: sweepStopTuples(reelSizes, options.resumeFrom?.processedRawIndex ?? BigInt(0)),
            sourceEnumerationId,
            ...(options.resumeFrom !== undefined
                ? {initialGrids: options.resumeFrom.grids, initialProcessedRawCount: options.resumeFrom.processedRawIndex}
                : {}),
        };
    }

    const bounded = sampled as BoundedCoverageGenerationOptions;
    return {
        strategy,
        totalOutcomeSpaceSize: estimate.totalOutcomeSpaceSize,
        progressTotal: bounded.sampleSize,
        reelWindows,
        tuples: sampleStopTuples(reelSizes, bounded.sampleSize, new SeededWeightedOutcomeRandomSource(bounded.seed)),
        sourceEnumerationId,
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
    const {game} = options;
    const manifest = game.getManifest();
    const prepared = prepare(options);

    const {grids, processedRawCount} = await accumulateUniqueGridWeights<string>(prepared.reelWindows, prepared.tuples, prepared.progressTotal, {
        signal: options.signal,
        onProgress: options.onProgress,
        initialGrids: prepared.initialGrids,
        initialProcessedRawCount: prepared.initialProcessedRawCount,
        sourceEnumerationId: prepared.sourceEnumerationId,
        heapUsedLimitBytes: options.heapUsedLimitBytes ?? defaultHeapUsedLimitBytes(),
        getHeapUsedBytes: options.getHeapUsedBytes ?? (() => process.memoryUsage().heapUsed),
    });

    const provenance: RoundArtifactProvenance = {
        game: manifest,
        pokieVersion: options.pokieVersion,
        ...(options.configHash !== undefined ? {configHash: options.configHash} : {}),
    };

    // Canonically sorted by id before ever being yielded -- both so this function's own output already
    // matches buildWeightedOutcomeLibrary's own sort order, and because a caller streaming this straight into
    // OutcomeLibraryBundleModeInput.outcomes (see streamExactWeightedOutcomes's own doc comment) requires
    // outcomes to already arrive in that order; the writer only ever verifies it, it never re-sorts.
    const sortedUniqueGrids = Array.from(grids.entries())
        .map(([gridKey, entry]) => ({id: outcomeIdForGrid(gridKey), entry}))
        .sort((a, b) => compareIds(a.id, b.id));

    for (const {id, entry} of sortedUniqueGrids) {
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

        yield {id, weight: toSafeWeightNumber(entry.weight, id), artifact};
    }

    return {
        algorithm: "pokie-exact-reel-enumeration-v1",
        strategy: prepared.strategy,
        totalOutcomeSpaceSize: toBigIntSafeDecimal(prepared.totalOutcomeSpaceSize),
        sampledRawCount: toBigIntSafeDecimal(processedRawCount),
        ...(prepared.strategy === "bounded-coverage" ? {seed: (options.sampled ?? options.bounded as BoundedCoverageGenerationOptions).seed} : {}),
        pokieVersion: options.pokieVersion,
        game: manifest,
        ...(options.configHash !== undefined ? {configHash: options.configHash} : {}),
        generatedAt: (options.now ?? (() => new Date()))().toISOString(),
    };
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
    const stream = streamExactWeightedOutcomes(options);
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
