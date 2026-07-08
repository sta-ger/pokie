export class ConfidenceIntervalCalculator {
    public static calculate95(mean: number, standardDeviation: number, sampleSize: number): {low: number; high: number} {
        if (sampleSize <= 0) {
            return {low: mean, high: mean};
        }
        const margin = 1.96 * (standardDeviation / Math.sqrt(sampleSize));
        return {
            low: mean - margin,
            high: mean + margin,
        };
    }
}
