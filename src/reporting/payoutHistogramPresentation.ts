// Human-readable payout buckets shared by Studio's inline chart and the downloaded Markdown/HTML
// reports. The raw histogram keys are the engine's fixed buckets (see PayoutHistogramBucketOrder.ts);
// this module only names and sorts them, never recomputes a simulation statistic.
// Labels state the exact interval, not just its endpoints: [a, b) includes a and excludes b,
// (0, 1) covers a positive payout below one, and [1,000, ∞) is the open-ended top bucket. The
// legacy keys keep a "legacy" suffix because their original inclusive-looking names do not say
// which endpoint is included; re-run the simulation for the unambiguous finer buckets.
const BUCKET_LABELS: Readonly<Record<string, string>> = {
    "0": "0 (no win)",
    "0-1": "(0, 1)",
    "1-2": "[1, 2)",
    "2-5": "[2, 5)",
    "5-10": "[5, 10)",
    "10-25": "[10, 25)",
    "25-50": "[25, 50)",
    "50-100": "[50, 100)",
    "100-250": "[100, 250)",
    "250-500": "[250, 500)",
    "500-1000": "[500, 1,000)",
    "1000+": "[1,000, ∞)",
    // Legacy buckets from reports produced before the finer histogram.
    "1-9": "1–9 (legacy)",
    "10-99": "10–99 (legacy)",
    "100+": "100+ (legacy)",
};

export type PayoutHistogramRow = {
    bucket: string;
    label: string;
    rounds: number;
    share: number;
};

export function payoutHistogramRows(histogram: Record<string, number> | undefined): PayoutHistogramRow[] {
    if (histogram === undefined) return [];
    const entries = Object.entries(histogram)
        .map(([bucket, count]) => [bucket, Number(count)] as const)
        .filter(([, count]) => Number.isFinite(count) && count >= 0);
    if (entries.length === 0) return [];
    const order = ["0", "0-1", "1-2", "2-5", "5-10", "10-25", "25-50", "50-100", "100-250", "250-500", "500-1000", "1000+", "1-9", "10-99", "100+"];
    const rank = new Map<string, number>(order.map((bucket, index) => [bucket, index]));
    entries.sort(([left], [right]) => {
        const leftRank = rank.get(left);
        const rightRank = rank.get(right);
        if (leftRank !== undefined || rightRank !== undefined) {
            return (leftRank ?? Number.MAX_SAFE_INTEGER) - (rightRank ?? Number.MAX_SAFE_INTEGER);
        }
        return left.localeCompare(right);
    });
    const total = entries.reduce((sum, [, count]) => sum + count, 0);
    return entries.map(([bucket, rounds]) => ({
        bucket,
        label: BUCKET_LABELS[bucket] ?? bucket,
        rounds,
        share: total === 0 ? 0 : rounds / total,
    }));
}

export function payoutHistogramBar(share: number, width = 24): string {
    const clamped = Math.max(0, Math.min(1, Number.isFinite(share) ? share : 0));
    const filled = Math.round(clamped * width);
    return "█".repeat(filled) + "·".repeat(Math.max(0, width - filled));
}

/** Human label for one raw histogram key, including the exact interval where the key identifies one. */
export function describePayoutHistogramBucket(bucket: string): string {
    return BUCKET_LABELS[bucket] ?? bucket;
}

/**
 * One-line, report-ready count summary. It names the actual buckets present instead of repeating a
 * stale hard-coded set, and it never calls the counts "currency" -- the histogram records paid rounds
 * in payout multiples of the bet.
 */
export function describePayoutHistogramBuckets(histogram: Record<string, number> | undefined): string {
    const rows = payoutHistogramRows(histogram);
    return rows.length === 0 ? "none" : rows.map((row) => `${row.label}=${row.rounds}`).join("; ");
}
