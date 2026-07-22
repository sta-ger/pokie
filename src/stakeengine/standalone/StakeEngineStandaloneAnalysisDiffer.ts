import type {
    StakeEngineStandaloneAnalysis,
    StakeEngineStandaloneExactDecimal,
    StakeEngineStandaloneModeAnalysis,
} from "./StakeEngineStandaloneAnalysis.js";
import type {
    StakeEngineStandaloneAnalysisDiff,
    StakeEngineStandaloneAnalysisEventCategoryBreakdownDiff,
    StakeEngineStandaloneAnalysisMetricDiff,
    StakeEngineStandaloneAnalysisPayoutBucketDiff,
    StakeEngineStandaloneModeAnalysisDiff,
} from "./StakeEngineStandaloneAnalysisDiff.js";
import type {StakeEngineStandaloneAnalysisDiffing} from "./StakeEngineStandaloneAnalysisDiffing.js";

export class StakeEngineStandaloneAnalysisDiffer implements StakeEngineStandaloneAnalysisDiffing {
    public static readonly DEFAULT_RTP_DELTA_WARNING_THRESHOLD: number = 0.01;
    public static readonly DEFAULT_HIT_FREQUENCY_DELTA_WARNING_THRESHOLD: number = 0.01;
    public static readonly DEFAULT_MAX_RATIO_PERCENT_DELTA_WARNING_THRESHOLD: number = 10;

    private readonly rtpDeltaWarningThreshold: number;
    private readonly hitFrequencyDeltaWarningThreshold: number;
    private readonly maxRatioPercentDeltaWarningThreshold: number;

    constructor(
        rtpDeltaWarningThreshold: number = StakeEngineStandaloneAnalysisDiffer.DEFAULT_RTP_DELTA_WARNING_THRESHOLD,
        hitFrequencyDeltaWarningThreshold: number = StakeEngineStandaloneAnalysisDiffer.DEFAULT_HIT_FREQUENCY_DELTA_WARNING_THRESHOLD,
        maxRatioPercentDeltaWarningThreshold: number = StakeEngineStandaloneAnalysisDiffer.DEFAULT_MAX_RATIO_PERCENT_DELTA_WARNING_THRESHOLD,
    ) {
        this.rtpDeltaWarningThreshold = rtpDeltaWarningThreshold;
        this.hitFrequencyDeltaWarningThreshold = hitFrequencyDeltaWarningThreshold;
        this.maxRatioPercentDeltaWarningThreshold = maxRatioPercentDeltaWarningThreshold;
    }

    public diff(left: StakeEngineStandaloneAnalysis, right: StakeEngineStandaloneAnalysis): StakeEngineStandaloneAnalysisDiff {
        const leftByModeName = new Map(left.modes.map((mode) => [mode.modeName, mode]));
        const rightByModeName = new Map(right.modes.map((mode) => [mode.modeName, mode]));
        const leftModeNames = left.modes.map((mode) => mode.modeName);
        const rightModeNames = right.modes.map((mode) => mode.modeName);

        const perMode: Record<string, StakeEngineStandaloneModeAnalysisDiff> = {};
        leftModeNames.forEach((modeName) => {
            const leftMode = leftByModeName.get(modeName);
            const rightMode = rightByModeName.get(modeName);
            if (leftMode !== undefined && rightMode !== undefined) {
                perMode[modeName] = this.diffMode(leftMode, rightMode);
            }
        });

        return {
            stakeDir: {left: left.stakeDir, right: right.stakeDir},
            perMode,
            onlyInLeft: leftModeNames.filter((modeName) => !rightByModeName.has(modeName)),
            onlyInRight: rightModeNames.filter((modeName) => !leftByModeName.has(modeName)),
        };
    }

    private diffMode(left: StakeEngineStandaloneModeAnalysis, right: StakeEngineStandaloneModeAnalysis): StakeEngineStandaloneModeAnalysisDiff {
        const rtp = this.metricDiff(left.rtp, right.rtp);
        const hitFrequency = this.metricDiff(left.hitFrequency, right.hitFrequency);
        const maxRatio = this.metricDiff(left.maxRatio, right.maxRatio);

        return {
            rtp,
            hitFrequency,
            zeroWinFrequency: this.metricDiff(left.zeroWinFrequency, right.zeroWinFrequency),
            variance: this.metricDiff(left.variance, right.variance),
            standardDeviation: this.metricDiff(left.standardDeviation, right.standardDeviation),
            maxPayoutMultiplier: this.metricDiff(left.maxPayoutMultiplier, right.maxPayoutMultiplier),
            maxRatio,
            maxWinProbability: this.metricDiff(left.maxWinProbability, right.maxWinProbability),
            nonInvertibleRatioCount: this.metricDiff(left.nonInvertibleRatioCount, right.nonInvertibleRatioCount),
            payoutDistribution: this.diffPayoutDistribution(left, right),
            eventClassificationBreakdown: this.diffEventClassificationBreakdown(left, right),
            warnings: this.buildWarnings(rtp, hitFrequency, maxRatio),
        };
    }

    private metricDiff(left: number, right: number): StakeEngineStandaloneAnalysisMetricDiff {
        const delta = right - left;
        const percentDelta = left !== 0 ? (delta / Math.abs(left)) * 100 : null;
        return {left, right, delta, percentDelta};
    }

    private diffPayoutDistribution(
        left: StakeEngineStandaloneModeAnalysis,
        right: StakeEngineStandaloneModeAnalysis,
    ): StakeEngineStandaloneAnalysisPayoutBucketDiff[] {
        const leftByMultiplier = new Map(left.payoutDistribution.map((bucket) => [bucket.payoutMultiplier, bucket.probability]));
        const rightByMultiplier = new Map(right.payoutDistribution.map((bucket) => [bucket.payoutMultiplier, bucket.probability]));
        const multipliers = [...new Set([...leftByMultiplier.keys(), ...rightByMultiplier.keys()])].sort((a, b) => a - b);

        return multipliers.map((payoutMultiplier) => ({
            payoutMultiplier,
            left: leftByMultiplier.get(payoutMultiplier) ?? null,
            right: rightByMultiplier.get(payoutMultiplier) ?? null,
        }));
    }

    private diffEventClassificationBreakdown(
        left: StakeEngineStandaloneModeAnalysis,
        right: StakeEngineStandaloneModeAnalysis,
    ): StakeEngineStandaloneAnalysisEventCategoryBreakdownDiff[] {
        const leftByCategory = new Map(left.eventClassificationBreakdown.map((entry) => [entry.category, entry]));
        const rightByCategory = new Map(right.eventClassificationBreakdown.map((entry) => [entry.category, entry]));
        const categories = [...new Set([...leftByCategory.keys(), ...rightByCategory.keys()])].sort();

        return categories.map((category) => {
            const leftEntry = leftByCategory.get(category);
            const rightEntry = rightByCategory.get(category);
            return {
                category,
                left: leftEntry === undefined ? null : this.eventCategoryMetrics(leftEntry),
                right: rightEntry === undefined ? null : this.eventCategoryMetrics(rightEntry),
            };
        });
    }

    private eventCategoryMetrics(entry: StakeEngineStandaloneModeAnalysis["eventClassificationBreakdown"][number]): {
        occurrenceFrequency: StakeEngineStandaloneExactDecimal;
        averageOccurrencesPerOutcome: StakeEngineStandaloneExactDecimal;
    } {
        return {
            occurrenceFrequency: entry.occurrenceFrequency,
            averageOccurrencesPerOutcome: entry.averageOccurrencesPerOutcome,
        };
    }

    private buildWarnings(
        rtp: StakeEngineStandaloneAnalysisMetricDiff,
        hitFrequency: StakeEngineStandaloneAnalysisMetricDiff,
        maxRatio: StakeEngineStandaloneAnalysisMetricDiff,
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

        if (maxRatio.left === 0 && maxRatio.right !== 0) {
            warnings.push(`Max ratio went from 0 to ${maxRatio.right.toFixed(2)}`);
        } else if (maxRatio.percentDelta !== null && Math.abs(maxRatio.percentDelta) >= this.maxRatioPercentDeltaWarningThreshold) {
            warnings.push(`Max ratio changed by ${this.formatSigned(maxRatio.percentDelta, 2)}% (${maxRatio.left.toFixed(2)} -> ${maxRatio.right.toFixed(2)})`);
        }

        return warnings;
    }

    private formatSigned(value: number, decimals: number): string {
        const rounded = value.toFixed(decimals);
        return value > 0 ? `+${rounded}` : rounded;
    }
}
