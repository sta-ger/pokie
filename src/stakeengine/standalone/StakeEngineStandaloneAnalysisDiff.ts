export type StakeEngineStandaloneAnalysisMetricDiff = {
    left: number;
    right: number;
    delta: number;
    percentDelta: number | null;
};

export type StakeEngineStandaloneAnalysisPayoutBucketDiff = {
    payoutMultiplier: number;
    left: number | null;
    right: number | null;
};

export type StakeEngineStandaloneAnalysisEventCategoryBreakdownDiff = {
    category: string;
    left: {occurrenceFrequency: number; averageOccurrencesPerOutcome: number} | null;
    right: {occurrenceFrequency: number; averageOccurrencesPerOutcome: number} | null;
};

export type StakeEngineStandaloneModeAnalysisDiff = {
    rtp: StakeEngineStandaloneAnalysisMetricDiff;
    hitFrequency: StakeEngineStandaloneAnalysisMetricDiff;
    zeroWinFrequency: StakeEngineStandaloneAnalysisMetricDiff;
    variance: StakeEngineStandaloneAnalysisMetricDiff;
    standardDeviation: StakeEngineStandaloneAnalysisMetricDiff;
    maxPayoutMultiplier: StakeEngineStandaloneAnalysisMetricDiff;
    maxRatio: StakeEngineStandaloneAnalysisMetricDiff;
    maxWinProbability: StakeEngineStandaloneAnalysisMetricDiff;
    nonInvertibleRatioCount: StakeEngineStandaloneAnalysisMetricDiff;
    payoutDistribution: readonly StakeEngineStandaloneAnalysisPayoutBucketDiff[];
    eventClassificationBreakdown: readonly StakeEngineStandaloneAnalysisEventCategoryBreakdownDiff[];
    warnings: readonly string[];
};

export type StakeEngineStandaloneAnalysisDiff = {
    stakeDir: {left: string; right: string};
    perMode: Record<string, StakeEngineStandaloneModeAnalysisDiff>;
    onlyInLeft: string[];
    onlyInRight: string[];
};
