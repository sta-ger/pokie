import type {StakeEngineOutcomeRecord} from "./StakeEngineOutcomeRecord.js";
import type {StakeEngineOutcomeSourceReadResult} from "./StakeEngineOutcomeSourceReadResult.js";
import {StakeEngineStandardEventClassifier} from "./StakeEngineStandardEventClassifier.js";
import type {StakeEngineEventClassifying} from "./StakeEngineEventClassifying.js";
import type {
    StakeEngineOutcomePayoutBucket,
    StakeEngineStandaloneAnalysis,
    StakeEngineStandaloneEventCategoryBreakdown,
    StakeEngineStandaloneModeAnalysis,
} from "./StakeEngineStandaloneAnalysis.js";
import type {StakeEngineStandaloneMode} from "./StakeEngineStandaloneMode.js";

// Computes exact -- not sampled -- weighted statistics directly over a standalone-read Stake Engine outcome
// directory's own normalized records, with no RoundArtifact/WeightedOutcomeLibrary ever built to get there (see
// StakeEngineOutcomeRecord's own doc comment for why that's a deliberate non-goal here). Assumes its input is
// StakeEngineOutcomeSourceReader's own output with no error-level issues (that reader guarantees a non-empty,
// structurally consistent set of outcomes per mode whenever it returns any modes at all) -- this class does not
// re-validate.
//
// Every weighted sum here normalizes each outcome's weight (divides by totalWeight) *before* multiplying by
// whatever quantity it's being weighted by, rather than summing raw weight*value products and dividing once at
// the end -- the same overflow-avoidance discipline WeightedOutcomeLibraryAnalyzer itself uses, and for the same
// reason (see that class's own doc comment).
export class StakeEngineStandaloneAnalyzer {
    private readonly classifier: StakeEngineEventClassifying;

    constructor(classifier: StakeEngineEventClassifying = new StakeEngineStandardEventClassifier()) {
        this.classifier = classifier;
    }

    public analyze(source: StakeEngineOutcomeSourceReadResult): StakeEngineStandaloneAnalysis {
        return {stakeDir: source.stakeDir, modes: source.modes.map((mode) => this.analyzeMode(mode))};
    }

    private analyzeMode(mode: StakeEngineStandaloneMode): StakeEngineStandaloneModeAnalysis {
        const outcomes = mode.outcomes;
        const totalWeight = outcomes.reduce((sum, outcome) => sum + outcome.weight, 0);
        const nonInvertibleRatioCount = outcomes.filter((outcome) => outcome.ratio === undefined).length;

        const effectiveRatio = (outcome: StakeEngineOutcomeRecord): number => outcome.ratio ?? outcome.payoutMultiplier / mode.cost / 100;

        const rtp = this.weightedAverage(outcomes, totalWeight, effectiveRatio);
        const hitFrequency = this.weightedAverage(outcomes, totalWeight, (outcome) => (outcome.payoutMultiplier > 0 ? 1 : 0));
        const zeroWinFrequency = 1 - hitFrequency;
        const variance = this.weightedAverage(outcomes, totalWeight, (outcome) => (effectiveRatio(outcome) - rtp) ** 2);
        const standardDeviation = Math.sqrt(variance);

        const maxPayoutMultiplier = outcomes.reduce((max, outcome) => Math.max(max, outcome.payoutMultiplier), 0);
        const maxRatio = outcomes.reduce((max, outcome) => (outcome.payoutMultiplier === maxPayoutMultiplier ? effectiveRatio(outcome) : max), 0);
        const maxWinProbability = this.weightedAverage(outcomes, totalWeight, (outcome) => (outcome.payoutMultiplier === maxPayoutMultiplier ? 1 : 0));

        return {
            modeName: mode.modeName,
            cost: mode.cost,
            outcomeCount: outcomes.length,
            totalWeight,
            rtp,
            hitFrequency,
            zeroWinFrequency,
            variance,
            standardDeviation,
            maxPayoutMultiplier,
            maxRatio,
            maxWinProbability,
            nonInvertibleRatioCount,
            payoutDistribution: this.buildPayoutDistribution(outcomes, totalWeight, mode.cost),
            eventClassificationBreakdown: this.buildEventClassificationBreakdown(outcomes, totalWeight),
        };
    }

    // sum((weight / totalWeight) * select(outcome)) -- see this class's own doc comment for why the division
    // happens per-term instead of once at the end.
    private weightedAverage(outcomes: readonly StakeEngineOutcomeRecord[], totalWeight: number, select: (outcome: StakeEngineOutcomeRecord) => number): number {
        return outcomes.reduce((sum, outcome) => sum + (outcome.weight / totalWeight) * select(outcome), 0);
    }

    // An exact probability mass function: one entry per exactly distinct payoutMultiplier value actually present
    // (grouped by strict numeric equality on Stake's own raw integer -- never on the reversed "ratio", so no
    // float-comparison ambiguity can ever merge or split a bucket), sorted ascending, probabilities summing to 1.
    private buildPayoutDistribution(outcomes: readonly StakeEngineOutcomeRecord[], totalWeight: number, cost: number): StakeEngineOutcomePayoutBucket[] {
        const bucketsByMultiplier = new Map<number, {probability: number; ratio: number | undefined; ratioAgrees: boolean}>();
        for (const outcome of outcomes) {
            const probability = outcome.weight / totalWeight;
            const existing = bucketsByMultiplier.get(outcome.payoutMultiplier);
            if (existing === undefined) {
                bucketsByMultiplier.set(outcome.payoutMultiplier, {probability, ratio: outcome.ratio, ratioAgrees: true});
            } else {
                bucketsByMultiplier.set(outcome.payoutMultiplier, {
                    probability: existing.probability + probability,
                    ratio: existing.ratio,
                    ratioAgrees: existing.ratioAgrees && existing.ratio === outcome.ratio,
                });
            }
        }

        return Array.from(bucketsByMultiplier.entries())
            .sort(([a], [b]) => a - b)
            .map(([payoutMultiplier, bucket]) => ({
                payoutMultiplier,
                // The same raw payoutMultiplier always reverses to the same ratio at a fixed cost, so
                // "ratioAgrees" only ever turns false if every outcome sharing this bucket independently failed
                // to reverse cleanly (all undefined, which already agrees) or disagreed some other way; guarded
                // defensively rather than assumed.
                ratio: bucket.ratioAgrees ? bucket.ratio : payoutMultiplier / cost / 100,
                probability: bucket.probability,
            }));
    }

    // Exact weighted frequency/average-count per classified event category -- see
    // StakeEngineStandaloneEventCategoryBreakdown's own doc comment for exactly what each field means.
    private buildEventClassificationBreakdown(outcomes: readonly StakeEngineOutcomeRecord[], totalWeight: number): StakeEngineStandaloneEventCategoryBreakdown[] {
        const occurrenceFrequencyByCategory = new Map<string, number>();
        const averageCountByCategory = new Map<string, number>();

        for (const outcome of outcomes) {
            const probability = outcome.weight / totalWeight;
            const countByCategory = new Map<string, number>();
            for (const event of outcome.events) {
                const category = this.classifier.classify(event).category;
                countByCategory.set(category, (countByCategory.get(category) ?? 0) + 1);
            }
            for (const [category, count] of countByCategory) {
                occurrenceFrequencyByCategory.set(category, (occurrenceFrequencyByCategory.get(category) ?? 0) + probability);
                averageCountByCategory.set(category, (averageCountByCategory.get(category) ?? 0) + probability * count);
            }
        }

        return Array.from(occurrenceFrequencyByCategory.keys())
            .sort()
            .map((category) => ({
                category,
                occurrenceFrequency: occurrenceFrequencyByCategory.get(category) as number,
                averageOccurrencesPerOutcome: averageCountByCategory.get(category) as number,
            }));
    }
}
