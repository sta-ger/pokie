import type {StakeEngineStandaloneExactDecimal} from "./StakeEngineStandaloneAnalysis.js";

export type StakeEngineStandaloneAnalysisMetricDiff = {
    left: number;
    right: number;
    delta: number;
    percentDelta: number | null;
};

export type StakeEngineStandaloneAnalysisPayoutBucketDiff = {
    payoutMultiplier: number;
    left: StakeEngineStandaloneExactDecimal | null;
    right: StakeEngineStandaloneExactDecimal | null;
};

export type StakeEngineStandaloneAnalysisEventCategoryBreakdownDiff = {
    category: string;
    left: {occurrenceFrequency: StakeEngineStandaloneExactDecimal; averageOccurrencesPerOutcome: StakeEngineStandaloneExactDecimal} | null;
    right: {occurrenceFrequency: StakeEngineStandaloneExactDecimal; averageOccurrencesPerOutcome: StakeEngineStandaloneExactDecimal} | null;
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
