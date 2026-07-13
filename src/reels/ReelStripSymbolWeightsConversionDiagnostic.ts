export type ReelStripSymbolWeightsConversionDiagnostic = {
    weights: Record<string, number>;
    counts: Record<string, number>;
    targetProportions: Record<string, number>;
    actualProportions: Record<string, number>;
    deviations: Record<string, number>;
};
