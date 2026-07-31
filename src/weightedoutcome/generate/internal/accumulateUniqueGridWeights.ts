import {WeightedOutcomeLibraryGenerationCancelledError} from "../WeightedOutcomeLibraryGenerationCancelledError.js";

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
export async function accumulateUniqueGridWeights<T extends string | number = string>(
    reelWindows: readonly T[][][],
    tuples: Generator<{tuple: number[]; rawIndex: bigint}>,
    progressTotal: bigint,
    options: {readonly signal?: AbortSignal; readonly onProgress?: (processedRawIndex: bigint, progressTotal: bigint) => void},
): Promise<{grids: Map<string, UniqueGridWeightEntry<T>>; processedRawCount: bigint}> {
    const grids = new Map<string, UniqueGridWeightEntry<T>>();
    let processedRawCount = BigInt(0);

    for (const {tuple, rawIndex} of tuples) {
        if (options.signal?.aborted) {
            throw new WeightedOutcomeLibraryGenerationCancelledError(rawIndex, progressTotal);
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
            options.onProgress?.(processedRawCount, progressTotal);
            await yieldToEventLoop();
        }
    }

    options.onProgress?.(processedRawCount, progressTotal);
    return {grids, processedRawCount};
}
