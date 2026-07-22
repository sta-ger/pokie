import type {StakeEngineOutcomeRecord} from "./StakeEngineOutcomeRecord.js";
import type {StakeEngineOutcomeSourceReadResult} from "./StakeEngineOutcomeSourceReadResult.js";
import {StakeEngineStandardEventClassifier} from "./StakeEngineStandardEventClassifier.js";
import type {StakeEngineEventClassifying} from "./StakeEngineEventClassifying.js";
import type {
    StakeEngineOutcomePayoutBucket,
    StakeEngineStandaloneAnalysis,
    StakeEngineStandaloneExactDecimal,
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
        const totalWeight = outcomes.reduce((sum, outcome) => sum + this.weightAsBigInt(outcome.weight), 0n);
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
            totalWeight: this.displayExactInteger(totalWeight),
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

    // Sum each normalized term without ever accumulating weight in a JS number. `select` is necessarily a number
    // (ratios originate in the Stake JSON format), so conversion happens only after the exact bigint fraction has
    // been formed. uint64 values are far below Number's finite range.
    private weightedAverage(outcomes: readonly StakeEngineOutcomeRecord[], totalWeight: bigint, select: (outcome: StakeEngineOutcomeRecord) => number): number {
        const average = outcomes.reduce((sum, outcome) => sum + this.probabilityAsNumber(this.weightAsBigInt(outcome.weight), totalWeight) * select(outcome), 0);
        return Number.isFinite(average) ? average : 0;
    }

    // An exact probability mass function: one entry per exactly distinct payoutMultiplier value actually present
    // (grouped by strict numeric equality on Stake's own raw integer -- never on the reversed "ratio", so no
    // float-comparison ambiguity can ever merge or split a bucket), sorted ascending, probabilities summing to 1.
    private buildPayoutDistribution(outcomes: readonly StakeEngineOutcomeRecord[], totalWeight: bigint, cost: number): StakeEngineOutcomePayoutBucket[] {
        const bucketsByMultiplier = new Map<number, {weight: bigint; ratio: number | undefined; ratioAgrees: boolean}>();
        for (const outcome of outcomes) {
            const weight = this.weightAsBigInt(outcome.weight);
            const existing = bucketsByMultiplier.get(outcome.payoutMultiplier);
            if (existing === undefined) {
                bucketsByMultiplier.set(outcome.payoutMultiplier, {weight, ratio: outcome.ratio, ratioAgrees: true});
            } else {
                bucketsByMultiplier.set(outcome.payoutMultiplier, {
                    weight: existing.weight + weight,
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
                probability: this.displayFraction(bucket.weight, totalWeight),
            }));
    }

    // Exact weighted frequency/average-count per classified event category -- see
    // StakeEngineStandaloneEventCategoryBreakdown's own doc comment for exactly what each field means.
    private buildEventClassificationBreakdown(outcomes: readonly StakeEngineOutcomeRecord[], totalWeight: bigint): StakeEngineStandaloneEventCategoryBreakdown[] {
        const occurrenceWeightByCategory = new Map<string, bigint>();
        const occurrenceCountWeightByCategory = new Map<string, bigint>();

        for (const outcome of outcomes) {
            const weight = this.weightAsBigInt(outcome.weight);
            const countByCategory = new Map<string, number>();
            for (const event of outcome.events) {
                const category = this.classifier.classify(event).category;
                countByCategory.set(category, (countByCategory.get(category) ?? 0) + 1);
            }
            for (const [category, count] of countByCategory) {
                occurrenceWeightByCategory.set(category, (occurrenceWeightByCategory.get(category) ?? 0n) + weight);
                occurrenceCountWeightByCategory.set(category, (occurrenceCountWeightByCategory.get(category) ?? 0n) + weight * BigInt(count));
            }
        }

        return Array.from(occurrenceWeightByCategory.keys())
            .sort()
            .map((category) => ({
                category,
                occurrenceFrequency: this.displayFraction(occurrenceWeightByCategory.get(category) as bigint, totalWeight),
                averageOccurrencesPerOutcome: this.displayFraction(occurrenceCountWeightByCategory.get(category) as bigint, totalWeight),
            }));
    }

    private weightAsBigInt(weight: StakeEngineOutcomeRecord["weight"]): bigint {
        if (typeof weight === "bigint") {
            if (weight > 0n && weight <= 0xffff_ffff_ffff_ffffn) {
                return weight;
            }
            throw new Error(`Standalone outcome weight must be a positive uint64 bigint; got ${weight}.`);
        }
        if (!Number.isSafeInteger(weight) || weight <= 0) {
            throw new Error(`Standalone outcome weight must be a positive uint64 bigint or safe integer; got ${weight}.`);
        }
        return BigInt(weight);
    }

    private displayExactInteger(value: bigint): StakeEngineStandaloneExactDecimal {
        return value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : value.toString();
    }

    private probabilityAsNumber(numerator: bigint, denominator: bigint): number {
        return Number(numerator) / Number(denominator);
    }

    // A decimal result can be represented exactly only when its reduced denominator factors into 2s and 5s. For
    // other fractions, expose a deterministic 40-place decimal rather than silently losing precision in a number.
    private displayFraction(numerator: bigint, denominator: bigint): StakeEngineStandaloneExactDecimal {
        if (numerator <= BigInt(Number.MAX_SAFE_INTEGER) && denominator <= BigInt(Number.MAX_SAFE_INTEGER)) {
            return this.probabilityAsNumber(numerator, denominator);
        }
        const whole = numerator / denominator;
        let remainder = numerator % denominator;
        if (remainder === 0n) {
            return whole.toString();
        }
        let decimals = "";
        for (let index = 0; index < 40 && remainder !== 0n; index += 1) {
            remainder *= 10n;
            decimals += (remainder / denominator).toString();
            remainder %= denominator;
        }
        return `${whole}.${decimals}`;
    }
}
