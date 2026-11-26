/**
 * "1 in N" reads badly when N rounds to 1 for a common outcome; keep precision near the mode.
 * Shared by the exact payout distribution and exact win-event tables so both use the same
 * convention instead of one showing "24" and the other "24.00".
 */
export function formatOneIn(probability: number): string {
    if (!Number.isFinite(probability) || probability <= 0) return "—";
    const inverse = 1 / probability;
    // "1 in 1.33" is arithmetically true but reads like a broken frequency. For an outcome that happens
    // more often than not, say so; the adjacent probability column already carries the exact number.
    if (inverse < 2) return "more than half";
    return inverse < 10 ? inverse.toFixed(2) : Math.round(inverse).toLocaleString("en-US");
}
