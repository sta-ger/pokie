// Fail-fast guard for constructor parameters that must be a positive, finite, whole number (a
// distance or run-length limit) -- Number.isInteger already rejects NaN and +/-Infinity (neither is
// an integer), so this single check covers every non-finite, zero, negative, and fractional value.
export function assertPositiveFiniteInteger(value: number, parameterName: string): void {
    if (!Number.isInteger(value) || value <= 0) {
        throw new Error(`${parameterName} must be a positive integer, got ${value}.`);
    }
}
