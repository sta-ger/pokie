// Thrown when the caller's own AbortSignal fires mid-enumeration. Unlike WeightedOutcomeLibraryGenerationError
// (a "this can never work" refusal), a cancellation is a normal, expected outcome for a long-running exact
// enumeration — so it carries exactly what a caller needs to resume: "processedRawIndex" is how many raw
// tuples were already drawn (0-based count; for the "exact" strategy this is a position in the reel-stop
// space, safe to pass straight back in as a later call's own "startIndex" on
// GenerateExactWeightedOutcomeLibraryOptions; for "bounded-coverage" it's a count of sampled draws instead,
// since that strategy has no single "position" to resume). "progressTotal" is whatever denominator the run's
// own onProgress callback was already reporting against (totalOutcomeSpaceSize for "exact", sampleSize for
// "bounded-coverage"), so a caller can report "cancelled at N / M" without a second estimate call. Resuming
// does not preserve the partial in-progress dedup/weight accumulation from the cancelled run — only the raw
// sweep position — so a caller resuming a single logical "exact" generation must resume from index 0 and
// merge nothing; "startIndex" exists to let independent, disjoint shards of the same space be swept in
// parallel and merged externally (weights across disjoint shards simply add).
export class WeightedOutcomeLibraryGenerationCancelledError extends Error {
    public readonly processedRawIndex: bigint;
    public readonly progressTotal: bigint;

    constructor(processedRawIndex: bigint, progressTotal: bigint) {
        super(`Weighted outcome library generation was cancelled after ${processedRawIndex} / ${progressTotal} raw draws.`);
        this.name = "WeightedOutcomeLibraryGenerationCancelledError";
        this.processedRawIndex = processedRawIndex;
        this.progressTotal = progressTotal;
    }
}
