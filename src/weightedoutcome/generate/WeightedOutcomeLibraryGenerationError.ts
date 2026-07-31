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
