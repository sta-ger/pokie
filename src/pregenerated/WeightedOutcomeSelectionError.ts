// Thrown by WeightedOutcomeSelector when it cannot select an outcome — an empty library, a total
// weight that isn't a finite number > 0, or a randomSource that violates its own [0, 1) contract.
// Selection assumes an already-validly-built library (see buildWeightedOutcomeLibrary); this is a
// defensive backstop, not the primary place library invariants are enforced.
export class WeightedOutcomeSelectionError extends Error {
    private readonly code: string;

    constructor(code: string, message: string) {
        super(message);
        this.name = "WeightedOutcomeSelectionError";
        this.code = code;
    }

    public getCode(): string {
        return this.code;
    }
}
