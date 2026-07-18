export type WeightedOutcomeLibraryAnalysisMetricDiff = {
    left: number;
    right: number;
    delta: number;
    percentDelta: number | null;
};

// A payoutMultiplier value present in only one side's payoutDistribution isn't "changed to/from 0
// probability" -- it's a bucket that only exists on that side -- so the side missing it gets null,
// mirroring how SimulationReportBreakdownComponentDiff represents a category present on only one side.
export type WeightedOutcomeLibraryAnalysisPayoutBucketDiff = {
    payoutMultiplier: number;
    left: number | null;
    right: number | null;
};

export type WeightedOutcomeLibraryAnalysisDiff = {
    rtp: WeightedOutcomeLibraryAnalysisMetricDiff;
    hitFrequency: WeightedOutcomeLibraryAnalysisMetricDiff;
    variance: WeightedOutcomeLibraryAnalysisMetricDiff;
    standardDeviation: WeightedOutcomeLibraryAnalysisMetricDiff;
    maxWin: WeightedOutcomeLibraryAnalysisMetricDiff;
    payoutDistribution: readonly WeightedOutcomeLibraryAnalysisPayoutBucketDiff[];
    warnings: readonly string[];
};
