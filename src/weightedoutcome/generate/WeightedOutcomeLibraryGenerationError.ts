// Thrown by generateExactWeightedOutcomeLibrary/streamExactWeightedOutcomes whenever exact, canonical
// generation cannot honestly proceed — never a partial or best-effort result mislabeled as exact. "code" is
// one of:
//   - "weighted-outcome-library-generation-unsupported": the loaded PokieGame doesn't implement
//     createExactEnumerationSession (see PokieGame's own doc comment) — a stateful/unbounded/non-reel
//     mechanic, or simply a game that hasn't opted in. There is no strategy to fall back to here.
//   - "weighted-outcome-library-generation-space-exceeded": the reel-stop combination space (product of
//     every reel's SymbolsSequence size) is larger than the caller's own maxOutcomeSpaceSize, and the
//     caller did not explicitly opt into a bounded/coverage strategy (see BoundedCoverageGenerationOptions)
//     — thrown instead of silently truncating or silently switching strategy.
//   - "weighted-outcome-library-generation-checkpoint-unsupported": a resumeFrom checkpoint was supplied but
//     this run no longer resolves to the "exact" strategy (see GenerateExactWeightedOutcomeLibraryOptions.resumeFrom)
//     — resuming only ever makes sense for a resumable raw sweep.
//   - "weighted-outcome-library-generation-checkpoint-mismatch": a resumeFrom checkpoint's own progressTotal
//     doesn't match this run's freshly-estimated exact outcome space size, OR its sourceEnumerationId (see
//     computeExactEnumerationSourceId) doesn't match this run's own game/config/reel-layout identity even
//     when progressTotal happens to coincide -- either way, it did not come from this same game/config's own
//     cancelled sweep.
//   - "weighted-outcome-library-generation-memory-exceeded": the accumulation phase's own heap usage crossed
//     its safety limit before finishing (see accumulateUniqueGridWeights/GenerateExactWeightedOutcomeLibraryOptions.
//     heapUsedLimitBytes) -- this game's reel/row layout evidently doesn't keep the distinct-grid count small
//     relative to the raw outcome-space size, so an exact sweep cannot safely complete in this process's
//     available memory. Not resumable (unlike a cancellation): the same memory ceiling would just be hit again
//     immediately on retry -- the caller needs a bounded-coverage sample instead.
export class WeightedOutcomeLibraryGenerationError extends Error {
    private readonly code: string;

    constructor(code: string, message: string) {
        super(message);
        this.name = "WeightedOutcomeLibraryGenerationError";
        this.code = code;
    }

    public getCode(): string {
        return this.code;
    }
}
