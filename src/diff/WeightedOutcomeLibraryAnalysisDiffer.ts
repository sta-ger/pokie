import type {WeightedOutcomeLibraryAnalysis} from "../weightedoutcome/WeightedOutcomeLibraryAnalysis.js";
import type {
    WeightedOutcomeLibraryAnalysisDiff,
    WeightedOutcomeLibraryAnalysisMetricDiff,
    WeightedOutcomeLibraryAnalysisPayoutBucketDiff,
} from "./WeightedOutcomeLibraryAnalysisDiff.js";
import type {WeightedOutcomeLibraryAnalysisDiffing} from "./WeightedOutcomeLibraryAnalysisDiffing.js";

// Mirrors SimulationReportDiffer's own shape exactly (per-metric {left,right,delta,percentDelta}, a
// warnings[] driven by configurable thresholds) -- diffs two already-computed WeightedOutcomeLibraryAnalysis
// results, never recomputes rtp/hitFrequency/variance/payoutDistribution itself (that stays exclusively in
// WeightedOutcomeLibraryAnalyzer).
export class WeightedOutcomeLibraryAnalysisDiffer implements WeightedOutcomeLibraryAnalysisDiffing {
    public static readonly DEFAULT_RTP_DELTA_WARNING_THRESHOLD: number = 0.01;
    public static readonly DEFAULT_HIT_FREQUENCY_DELTA_WARNING_THRESHOLD: number = 0.01;
    public static readonly DEFAULT_MAX_WIN_PERCENT_DELTA_WARNING_THRESHOLD: number = 10;

    private readonly rtpDeltaWarningThreshold: number;
    private readonly hitFrequencyDeltaWarningThreshold: number;
    private readonly maxWinPercentDeltaWarningThreshold: number;

    constructor(
        rtpDeltaWarningThreshold: number = WeightedOutcomeLibraryAnalysisDiffer.DEFAULT_RTP_DELTA_WARNING_THRESHOLD,
        hitFrequencyDeltaWarningThreshold: number = WeightedOutcomeLibraryAnalysisDiffer.DEFAULT_HIT_FREQUENCY_DELTA_WARNING_THRESHOLD,
        maxWinPercentDeltaWarningThreshold: number = WeightedOutcomeLibraryAnalysisDiffer.DEFAULT_MAX_WIN_PERCENT_DELTA_WARNING_THRESHOLD,
    ) {
        this.rtpDeltaWarningThreshold = rtpDeltaWarningThreshold;
        this.hitFrequencyDeltaWarningThreshold = hitFrequencyDeltaWarningThreshold;
        this.maxWinPercentDeltaWarningThreshold = maxWinPercentDeltaWarningThreshold;
    }

    public diff(left: WeightedOutcomeLibraryAnalysis, right: WeightedOutcomeLibraryAnalysis): WeightedOutcomeLibraryAnalysisDiff {
        const rtp = this.metricDiff(left.rtp, right.rtp);
        const hitFrequency = this.metricDiff(left.hitFrequency, right.hitFrequency);
        const variance = this.metricDiff(left.variance, right.variance);
        const standardDeviation = this.metricDiff(left.standardDeviation, right.standardDeviation);
        const maxWin = this.metricDiff(left.maxWin, right.maxWin);

        return {
            rtp,
            hitFrequency,
            variance,
            standardDeviation,
            maxWin,
            payoutDistribution: this.diffPayoutDistribution(left, right),
            warnings: this.buildWarnings(rtp, hitFrequency, maxWin),
        };
    }

    private metricDiff(left: number, right: number): WeightedOutcomeLibraryAnalysisMetricDiff {
        const delta = right - left;
        const percentDelta = left !== 0 ? (delta / Math.abs(left)) * 100 : null;
        return {left, right, delta, percentDelta};
    }

    private diffPayoutDistribution(
        left: WeightedOutcomeLibraryAnalysis,
        right: WeightedOutcomeLibraryAnalysis,
    ): WeightedOutcomeLibraryAnalysisPayoutBucketDiff[] {
        const leftByMultiplier = new Map(left.payoutDistribution.map((bucket) => [bucket.payoutMultiplier, bucket.probability]));
        const rightByMultiplier = new Map(right.payoutDistribution.map((bucket) => [bucket.payoutMultiplier, bucket.probability]));
        const multipliers = [...new Set([...leftByMultiplier.keys(), ...rightByMultiplier.keys()])].sort((a, b) => a - b);

        return multipliers.map((payoutMultiplier) => ({
            payoutMultiplier,
            left: leftByMultiplier.get(payoutMultiplier) ?? null,
            right: rightByMultiplier.get(payoutMultiplier) ?? null,
        }));
    }

    private buildWarnings(
        rtp: WeightedOutcomeLibraryAnalysisMetricDiff,
        hitFrequency: WeightedOutcomeLibraryAnalysisMetricDiff,
        maxWin: WeightedOutcomeLibraryAnalysisMetricDiff,
    ): string[] {
        const warnings: string[] = [];

        if (Math.abs(rtp.delta) >= this.rtpDeltaWarningThreshold) {
            warnings.push(
                `RTP changed by ${this.formatSigned(rtp.delta * 100, 2)} percentage points ` +
                    `(${(rtp.left * 100).toFixed(2)}% -> ${(rtp.right * 100).toFixed(2)}%)`,
            );
        }

        if (Math.abs(hitFrequency.delta) >= this.hitFrequencyDeltaWarningThreshold) {
            warnings.push(
                `Hit frequency changed by ${this.formatSigned(hitFrequency.delta * 100, 2)} percentage points ` +
                    `(${(hitFrequency.left * 100).toFixed(2)}% -> ${(hitFrequency.right * 100).toFixed(2)}%)`,
            );
        }

        if (maxWin.left === 0 && maxWin.right !== 0) {
            warnings.push(`Max win went from 0 to ${maxWin.right.toFixed(2)}`);
        } else if (maxWin.percentDelta !== null && Math.abs(maxWin.percentDelta) >= this.maxWinPercentDeltaWarningThreshold) {
            warnings.push(`Max win changed by ${this.formatSigned(maxWin.percentDelta, 2)}% (${maxWin.left.toFixed(2)} -> ${maxWin.right.toFixed(2)})`);
        }

        return warnings;
    }

    private formatSigned(value: number, decimals: number): string {
        const rounded = value.toFixed(decimals);
        return value > 0 ? `+${rounded}` : rounded;
    }
}
