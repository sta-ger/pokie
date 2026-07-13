export type ReelStripAnalysis = {
    length: number;
    symbolCounts: Record<string, number>;
    symbolFrequencies: Record<string, number>;
    minimumCircularDistances: Record<string, number>;
    maximumConsecutiveOccurrences: Record<string, number>;
};
