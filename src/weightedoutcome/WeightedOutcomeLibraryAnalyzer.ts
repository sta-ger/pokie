import {deepFreeze} from "../internal/deepFreeze.js";
import type {WeightedOutcome} from "./WeightedOutcome.js";
import type {WeightedOutcomeLibrary} from "./WeightedOutcomeLibrary.js";
import type {WeightedOutcomeLibraryAnalysis, WeightedOutcomePayoutBucket} from "./WeightedOutcomeLibraryAnalysis.js";

// Computes exact — not sampled — statistics over a WeightedOutcomeLibrary: every outcome's own weight
// contributes to the result directly, with no Monte Carlo estimation or confidence interval involved. Assumes
// its input is a validly-built library (see buildWeightedOutcomeLibrary, which already guarantees a finite,
// positive total weight and a JSON-safe, finite, non-negative payoutMultiplier/totalWin on every outcome) —
// this class does not re-validate; use WeightedOutcomeLibraryValidator first for a library from an untrusted
// source.
//
// Every weighted sum here normalizes each outcome's weight (divides by totalWeight) *before* multiplying by
// whatever quantity it's being weighted by, rather than summing raw `weight * value` products and dividing once
// at the end. A weighted mean of finite values with finite positive weights is always itself finite — but
// `weight * value` can transiently overflow to Infinity even when the true, correctly-computed mean would not
// (e.g. a handful of outcomes with weights near Number.MAX_VALUE): normalizing first keeps every intermediate
// term bounded by the input values themselves, so the final rtp/variance/probabilities can only be NaN/Infinity
// if the true mathematical result actually is — never as an artifact of summation order.
export class WeightedOutcomeLibraryAnalyzer<T extends string | number = string> {
    public analyze(library: WeightedOutcomeLibrary<T>): WeightedOutcomeLibraryAnalysis {
        const outcomes = library.outcomes;
        const totalWeight = outcomes.reduce((sum, outcome) => sum + outcome.weight, 0);

        const rtp = this.weightedAverage(outcomes, totalWeight, (outcome) => outcome.artifact.payoutMultiplier);

        const hitFrequency = this.weightedAverage(outcomes, totalWeight, (outcome) =>
            outcome.artifact.totalWin > 0 ? 1 : 0,
        );
        const zeroWinFrequency = 1 - hitFrequency;

        const variance = this.weightedAverage(
            outcomes,
            totalWeight,
            (outcome) => (outcome.artifact.payoutMultiplier - rtp) ** 2,
        );
        const standardDeviation = Math.sqrt(variance);

        const maxWin = outcomes.reduce((max, outcome) => Math.max(max, outcome.artifact.totalWin), 0);
        const maxWinProbability = this.weightedAverage(outcomes, totalWeight, (outcome) =>
            outcome.artifact.totalWin === maxWin ? 1 : 0,
        );

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

    // sum((weight / totalWeight) * select(outcome)) — see this class's own doc comment for why the division
    // happens per-term instead of once at the end.
    private weightedAverage(
        outcomes: readonly WeightedOutcome<T>[],
        totalWeight: number,
        select: (outcome: WeightedOutcome<T>) => number,
    ): number {
        return outcomes.reduce((sum, outcome) => sum + (outcome.weight / totalWeight) * select(outcome), 0);
    }

    // An exact probability mass function: one entry per *exactly* distinct payoutMultiplier value actually
    // present among the outcomes (grouped by strict numeric equality via a Map keyed on the number itself — no
    // rounding, so two outcomes whose multipliers differ by any amount, however small, are never merged),
    // sorted ascending, with probabilities summing to 1.
    private buildPayoutDistribution(
        outcomes: readonly WeightedOutcome<T>[],
        totalWeight: number,
    ): WeightedOutcomePayoutBucket[] {
        const probabilityByMultiplier = new Map<number, number>();
        for (const outcome of outcomes) {
            const multiplier = outcome.artifact.payoutMultiplier;
            const probability = outcome.weight / totalWeight;
            probabilityByMultiplier.set(multiplier, (probabilityByMultiplier.get(multiplier) ?? 0) + probability);
        }

        return Array.from(probabilityByMultiplier.entries())
            .sort(([a], [b]) => a - b)
            .map(([payoutMultiplier, probability]) => ({payoutMultiplier, probability}));
    }
}
