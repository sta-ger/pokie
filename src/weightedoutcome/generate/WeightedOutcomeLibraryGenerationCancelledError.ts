import type {UniqueGridWeightEntry} from "./internal/accumulateUniqueGridWeights.js";

// The raw material a cancelled "exact" run hands back so a later call can pick up exactly where it left off
// -- not just the raw sweep position, but every unique grid/weight already accumulated up to that position,
// keyed the same way accumulateUniqueGridWeights keys them internally. Passing this straight back in as a
// later GenerateExactWeightedOutcomeLibraryOptions.resumeFrom continues the same logical sweep: the resumed
// run seeds its own accumulation from "grids" and continues sweeping raw tuples from "processedRawIndex", so
// the merged result -- once the sweep actually reaches "progressTotal" without cancelling again -- has the
// exact same outcome ids/weights as an uninterrupted run over the whole space. Only ever pass a checkpoint
// straight from the WeightedOutcomeLibraryGenerationCancelledError of the SAME logical sweep; nothing here
// re-derives which game/config it came from on its own -- "sourceEnumerationId" is that derived identity (see
// computeExactEnumerationSourceId), checked by generateExactWeightedOutcomeLibrary before a checkpoint's grids
// are ever merged in, so a checkpoint from a different game/config/reel-layout fails closed instead of silently
// producing a wrong (though still internally consistent-looking) result even when its progressTotal happens to
// match by coincidence.
export type ExactEnumerationCheckpoint = {
    readonly processedRawIndex: bigint;
    readonly progressTotal: bigint;
    readonly grids: ReadonlyMap<string, UniqueGridWeightEntry<string>>;
    readonly sourceEnumerationId: string;
};

// Thrown when the caller's own AbortSignal fires mid-enumeration. Unlike WeightedOutcomeLibraryGenerationError
// (a "this can never work" refusal), a cancellation is a normal, expected outcome for a long-running exact
// enumeration -- so it carries exactly what a caller needs to resume without losing already-accumulated
// weights: see ExactEnumerationCheckpoint. "processedRawIndex"/"progressTotal" are also exposed directly (same
// values as checkpoint.processedRawIndex/progressTotal) purely so a caller can report "cancelled at N / M"
// without reaching into checkpoint for the common progress-reporting case.
export class WeightedOutcomeLibraryGenerationCancelledError extends Error {
    public readonly processedRawIndex: bigint;
    public readonly progressTotal: bigint;
    public readonly checkpoint: ExactEnumerationCheckpoint;

    constructor(processedRawIndex: bigint, progressTotal: bigint, grids: ExactEnumerationCheckpoint["grids"], sourceEnumerationId: string) {
        super(`Weighted outcome library generation was cancelled after ${processedRawIndex} / ${progressTotal} raw draws.`);
        this.name = "WeightedOutcomeLibraryGenerationCancelledError";
        this.processedRawIndex = processedRawIndex;
        this.progressTotal = progressTotal;
        this.checkpoint = {processedRawIndex, progressTotal, grids, sourceEnumerationId};
    }
}
