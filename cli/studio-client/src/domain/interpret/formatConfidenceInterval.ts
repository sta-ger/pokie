/** RTP bounds are ratios; average-payout bounds already use payout units. */
export function formatConfidenceInterval(
    interval: {low: number; high: number} | undefined,
    unit: "percent" | "payout" = "percent",
): string {
    if (!interval) return "—";
    if (unit === "payout") return `${interval.low.toFixed(2)} – ${interval.high.toFixed(2)}`;
    return `${(interval.low * 100).toFixed(2)}% – ${(interval.high * 100).toFixed(2)}%`;
}
