import {WeightedOutcomeLibraryGenerationCancelledError} from "../WeightedOutcomeLibraryGenerationCancelledError.js";
import {WeightedOutcomeLibraryGenerationError} from "../WeightedOutcomeLibraryGenerationError.js";

// How often (in raw tuples processed) this reports progress and yields the event loop -- frequent enough that
// cancellation/progress stay responsive, infrequent enough that the setImmediate round-trip never dominates a
// large exact sweep's own runtime.
const YIELD_EVERY = BigInt(5000);

// Same defaultYieldToEventLoop shape ParallelSimulationRunner/StudioReplayExecutionService/StudioSimulationService
// already use for the same reason: a long CPU-bound loop needs a real event-loop tick between chunks so
// cancellation/progress stay observable to the rest of the process, not just a resolved-immediately microtask.
function yieldToEventLoop(): Promise<void> {
    return new Promise((resolve) => {
        setImmediate(resolve);
    });
}

export type UniqueGridWeightEntry<T extends string | number = string> = {readonly grid: T[][]; weight: bigint};

// Phase 1 of exact/bounded-coverage generation: streams every raw reel-stop tuple "tuples" produces (never
// materializing them as an array -- see sweepStopTuples/sampleStopTuples), resolves each into its visible
// grid via the precomputed reel windows, and accumulates an exact integer weight per DISTINCT grid --
// mirroring SymbolsCombinationsAnalyzer.getUniqueCombinationsWithWeights's own "dedupe identical grids so the
// expensive win-calculation step only runs once per unique grid" optimization (see math-modeling.md), just
// bigint-safe and streamed. Memory is bounded by the number of distinct grids actually reachable, not by the
// (potentially far larger) raw combination count "tuples" sweeps through.
//
// "initialGrids"/"initialProcessedRawCount" seed the accumulation from a prior cancelled run's own
// ExactEnumerationCheckpoint (see WeightedOutcomeLibraryGenerationCancelledError) -- when provided, the
// returned "grids"/"processedRawCount" are the MERGED totals across the checkpoint and everything newly swept
// here, not just what this call itself processed, so a caller resuming a single logical sweep to completion
// gets back the same accumulation an uninterrupted run would have produced.
export async function accumulateUniqueGridWeights<T extends string | number = string>(
    reelWindows: readonly T[][][],
    tuples: Generator<{tuple: number[]; rawIndex: bigint}>,
    progressTotal: bigint,
    options: {
        readonly signal?: AbortSignal;
        readonly onProgress?: (processedRawIndex: bigint, progressTotal: bigint) => void;
        readonly initialGrids?: ReadonlyMap<string, UniqueGridWeightEntry<T>>;
        readonly initialProcessedRawCount?: bigint;
        readonly sourceEnumerationId: string;
        // Checked at the same cadence as onProgress/the event-loop yield (every YIELD_EVERY raw combinations),
        // never per-combination -- cheap enough not to matter, frequent enough to fail closed well before an
        // actually unbounded sweep (see generateExactWeightedOutcomeLibrary's own doc comment on why "distinct
        // grids" can, for a wide/many-reel grid, approach the raw combination count instead of staying small)
        // takes down the whole process with an uncatchable V8 out-of-memory abort instead of this catchable,
        // actionable error. Both left undefined (generateExactWeightedOutcomeLibrary's own default) disables
        // the guard entirely -- used by tests that accumulate real grids with no interest in this behavior.
        readonly getHeapUsedBytes?: () => number;
        readonly heapUsedLimitBytes?: number;
    },
): Promise<{grids: Map<string, UniqueGridWeightEntry<T>>; processedRawCount: bigint}> {
    const grids = new Map<string, UniqueGridWeightEntry<T>>(
        Array.from(options.initialGrids ?? [], ([key, entry]) => [key, {grid: entry.grid, weight: entry.weight}]),
    );
    let processedRawCount = options.initialProcessedRawCount ?? BigInt(0);

    for (const {tuple, rawIndex} of tuples) {
        if (options.signal?.aborted) {
            // Cast: ExactEnumerationCheckpoint fixes its grid symbol type at string, matching this module's
            // only real caller (generateExactWeightedOutcomeLibrary, always T = string); accumulateUniqueGridWeights
            // itself stays generic over T = string | number for its own, unrelated reasons.
            throw new WeightedOutcomeLibraryGenerationCancelledError(
                rawIndex,
                progressTotal,
                grids as unknown as ReadonlyMap<string, UniqueGridWeightEntry<string>>,
                options.sourceEnumerationId,
            );
        }

        const grid = tuple.map((position, reelId) => reelWindows[reelId][position]) as T[][];
        const key = JSON.stringify(grid);
        const entry = grids.get(key);
        if (entry) {
            entry.weight += BigInt(1);
        } else {
            grids.set(key, {grid, weight: BigInt(1)});
        }

        processedRawCount++;
        if (processedRawCount % YIELD_EVERY === BigInt(0)) {
            if (options.heapUsedLimitBytes !== undefined && options.getHeapUsedBytes !== undefined) {
                const heapUsedBytes = options.getHeapUsedBytes();
                if (heapUsedBytes > options.heapUsedLimitBytes) {
                    throw new WeightedOutcomeLibraryGenerationError(
                        "weighted-outcome-library-generation-memory-exceeded",
                        `Exact generation aborted after ${processedRawCount}/${progressTotal} raw combinations -- ` +
                            `heap usage (${Math.round(heapUsedBytes / (1024 * 1024))} MB) exceeded its safety limit ` +
                            `(${Math.round(options.heapUsedLimitBytes / (1024 * 1024))} MB) before finishing. The distinct-grid count this ` +
                            "game's own reel/row layout reaches evidently does not stay small relative to the raw outcome-space size, " +
                            "so an exact sweep cannot safely complete in this process's available memory. Re-run with an explicit " +
                            `bounded-coverage sample instead: --max-outcome-space-size below ${progressTotal} (this run's own raw space -- ` +
                            "--bounded is otherwise ignored whenever the space already fits under the default/given cap) together with " +
                            "--bounded --sample-size <n> --seed <seed>. Or generate in a process with more available memory.",
                    );
                }
            }
            options.onProgress?.(processedRawCount, progressTotal);
            await yieldToEventLoop();
        }
    }

    options.onProgress?.(processedRawCount, progressTotal);
    return {grids, processedRawCount};
}
