/**
 * Parse one paytable payout field without ever turning an empty or non-numeric
 * field into a real zero payout. The previous committed value is kept when the
 * draft is not a valid non-negative number, and the caller can show `error`
 * next to the field so the edit is visibly rejected instead of silently saved.
 */
export function parsePayoutInput(input: number | string, previous: number): {value: number; error?: string} {
    const text = String(input).trim();
    if (text.length === 0) {
        return {value: previous, error: "Enter a payout number. The previous value was kept."};
    }
    const parsed = Number(text);
    if (!Number.isFinite(parsed)) {
        return {value: previous, error: "Payout must be a number. The previous value was kept."};
    }
    if (parsed < 0) {
        return {value: previous, error: "Payout cannot be negative. The previous value was kept."};
    }
    return {value: parsed};
}
