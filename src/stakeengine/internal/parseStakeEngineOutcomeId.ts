const CANONICAL_NON_NEGATIVE_INTEGER = /^(0|[1-9]\d*)$/;

// Stake Engine's books/lookup-table "id" column is an integer, but WeightedOutcome.id is always a caller-
// supplied string (see WeightedOutcome's own doc comment on why it's never auto-generated). Rather than invent
// a mapping (a hash, an incidental array index, ...) — which would be a second, silently-diverging calculation
// path — this requires the string to already be the canonical decimal form of a safe non-negative integer, and
// simply parses it. Returns undefined for anything else (non-numeric, negative, leading zeros, fractional,
// unsafe-integer), which StakeEngineExportValidator turns into a validation error.
export function parseStakeEngineOutcomeId(id: string): number | undefined {
    if (!CANONICAL_NON_NEGATIVE_INTEGER.test(id)) {
        return undefined;
    }
    const parsed = Number(id);
    return Number.isSafeInteger(parsed) ? parsed : undefined;
}
