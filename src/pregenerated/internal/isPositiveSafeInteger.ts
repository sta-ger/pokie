// Shared, stricter-than-"finite number > 0" guard: selection requires every weight — and their sum —
// to be a positive safe integer (see WeightedOutcomeSelector's own doc comment for why exact
// selection needs this), used consistently by the selector, buildPreGeneratedRoundResult, and
// PreGeneratedRoundResultValidator so all three enforce exactly the same definition of "a valid
// weight", never three subtly different ones.
export function isPositiveSafeInteger(value: unknown): value is number {
    return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}
