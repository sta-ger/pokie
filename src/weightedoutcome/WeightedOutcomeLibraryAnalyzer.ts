import {deepFreeze} from "../internal/deepFreeze.js";
import type {WeightedOutcome} from "./WeightedOutcome.js";
import type {WeightedOutcomeLibrary} from "./WeightedOutcomeLibrary.js";
import type {WeightedOutcomeLibraryAnalysis, WeightedOutcomePayoutBucket} from "./WeightedOutcomeLibraryAnalysis.js";

// Multiplier values are grouped for the exact payout distribution at this precision (matches the FLOAT_EPSILON
// convention used throughout src/artifact/) so floating-point noise from totalWin/stake division never
// fragments what is conceptually one payout level into several near-identical buckets.
const PAYOUT_MULTIPLIER_GROUPING_PRECISION = 9;

// Computes exact — not sampled — statistics over a WeightedOutcomeLibrary: every outcome's own weight
// contributes to the result directly, with no Monte Carlo estimation or confidence interval involved. Assumes
// its input is a validly-built library (see buildWeightedOutcomeLibrary, which already guarantees a positive
// total weight and JSON-safe, finite, non-negative payoutMultiplier/totalWin on every outcome) — this class
// does not re-validate; use WeightedOutcomeLibraryValidator first for a library from an untrusted source.
export class WeightedOutcomeLibraryAnalyzer<T extends string | number = string> {
    public analyze(library: WeightedOutcomeLibrary<T>): WeightedOutcomeLibraryAnalysis {
        const outcomes = library.outcomes;
        const totalWeight = outcomes.reduce((sum, outcome) => sum + outcome.weight, 0);

        const rtp = this.weightedSum(outcomes, totalWeight, (outcome) => outcome.artifact.payoutMultiplier);

        const hitWeight = outcomes.reduce((sum, outcome) => sum + (outcome.artifact.totalWin > 0 ? outcome.weight : 0), 0);
        const hitFrequency = hitWeight / totalWeight;
        const zeroWinFrequency = 1 - hitFrequency;

        const variance = this.weightedSum(
            outcomes,
            totalWeight,
            (outcome) => (outcome.artifact.payoutMultiplier - rtp) ** 2,
        );
        const standardDeviation = Math.sqrt(variance);

        const maxWin = outcomes.reduce((max, outcome) => Math.max(max, outcome.artifact.totalWin), 0);
        const maxWinWeight = outcomes.reduce(
            (sum, outcome) => sum + (outcome.artifact.totalWin === maxWin ? outcome.weight : 0),
            0,
        );
        const maxWinProbability = maxWinWeight / totalWeight;

        const payoutDistribution = this.buildPayoutDistribution(outcomes, totalWeight);

        return deepFreeze({
            totalWeight,
            rtp,
            hitFrequency,
            zeroWinFrequency,
            variance,
            standardDeviation,
            maxWin,
            maxWinProbability,
            payoutDistribution,
        });
    }

    private weightedSum(
        outcomes: readonly WeightedOutcome<T>[],
        totalWeight: number,
        select: (outcome: WeightedOutcome<T>) => number,
    ): number {
        return outcomes.reduce((sum, outcome) => sum + outcome.weight * select(outcome), 0) / totalWeight;
    }

    private buildPayoutDistribution(
        outcomes: readonly WeightedOutcome<T>[],
        totalWeight: number,
    ): WeightedOutcomePayoutBucket[] {
        const weightByMultiplier = new Map<string, {multiplier: number; weight: number}>();
        for (const outcome of outcomes) {
            const multiplier = outcome.artifact.payoutMultiplier;
            const key = multiplier.toFixed(PAYOUT_MULTIPLIER_GROUPING_PRECISION);
            const bucket = weightByMultiplier.get(key);
            if (bucket) {
                bucket.weight += outcome.weight;
            } else {
                weightByMultiplier.set(key, {multiplier, weight: outcome.weight});
            }
        }

        return Array.from(weightByMultiplier.values())
            .sort((a, b) => a.multiplier - b.multiplier)
            .map((bucket) => ({payoutMultiplier: bucket.multiplier, probability: bucket.weight / totalWeight}));
    }
}
