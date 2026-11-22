// Human-readable payout buckets shared by Studio's inline chart and the downloaded Markdown/HTML
// reports. The raw histogram keys are the engine's fixed buckets (see PayoutHistogramBucketOrder.ts);
// this module only names and sorts them, never recomputes a simulation statistic.
const KNOWN_BUCKET_ORDER = ["0", "1-9", "10-99", "100+"] as const;

export type PayoutHistogramRow = {
    bucket: string;
    label: string;
    rounds: number;
    share: number;
};

function bucketLabel(bucket: string): string {
    if (bucket === "0") return "0 (no win)";
    if (bucket === "1-9") return "1–9";
    if (bucket === "10-99") return "10–99";
    if (bucket === "100+") return "100+";
    return bucket;
}

export function payoutHistogramRows(histogram: Record<string, number> | undefined): PayoutHistogramRow[] {
    if (histogram === undefined) return [];
    const entries = Object.entries(histogram)
        .map(([bucket, count]) => [bucket, Number(count)] as const)
        .filter(([, count]) => Number.isFinite(count) && count >= 0);
    if (entries.length === 0) return [];
    const rank = new Map<string, number>(KNOWN_BUCKET_ORDER.map((bucket, index) => [bucket, index]));
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
        label: bucketLabel(bucket),
        rounds,
        share: total === 0 ? 0 : rounds / total,
    }));
}

export function payoutHistogramBar(share: number, width = 24): string {
    const clamped = Math.max(0, Math.min(1, Number.isFinite(share) ? share : 0));
    const filled = Math.round(clamped * width);
    return "█".repeat(filled) + "·".repeat(Math.max(0, width - filled));
}
