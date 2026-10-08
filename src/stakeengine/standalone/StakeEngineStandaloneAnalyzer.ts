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
// re-validate the external format. Direct-call weights, positive totals, and finite moments are guarded.
//
// Every weighted sum here normalizes each outcome's weight (divides by totalWeight) *before* multiplying by
// whatever quantity it's being weighted by, rather than summing raw weight*value products and dividing once at
// the end -- the same overflow-avoidance discipline WeightedOutcomeLibraryAnalyzer itself uses, and for the same
// reason (see that class's own doc comment).
export class StakeEngineStandaloneAnalyzer {
    private static readonly ZERO = BigInt(0);
    private static readonly UINT64_MAX = BigInt("18446744073709551615");
    private static readonly TEN = BigInt(10);

    private readonly classifier: StakeEngineEventClassifying;

    constructor(classifier: StakeEngineEventClassifying = new StakeEngineStandardEventClassifier()) {
        this.classifier = classifier;
    }

    public analyze(source: StakeEngineOutcomeSourceReadResult): StakeEngineStandaloneAnalysis {
        return {stakeDir: source.stakeDir, modes: source.modes.map((mode) => this.analyzeMode(mode))};
    }

    private analyzeMode(mode: StakeEngineStandaloneMode): StakeEngineStandaloneModeAnalysis {
        const outcomes = mode.outcomes;
        const totalWeight = outcomes.reduce((sum, outcome) => sum + this.weightAsBigInt(outcome.weight), StakeEngineStandaloneAnalyzer.ZERO);
        if (totalWeight === StakeEngineStandaloneAnalyzer.ZERO) {
            throw new Error(`Standalone mode "${mode.modeName}" must have a positive total weight.`);
        }
        const nonInvertibleRatioCount = outcomes.filter((outcome) => outcome.ratio === undefined).length;

        const effectiveRatio = (outcome: StakeEngineOutcomeRecord): number => outcome.ratio ?? outcome.payoutMultiplier / mode.cost / 100;

        // The minimum anchors constant/neighboring payouts without subtracting a dominant mean
        // from a positive rare-win contribution (which would cancel if the rare win came first).
        const anchor = outcomes.reduce((min, outcome) => Math.min(min, effectiveRatio(outcome)), effectiveRatio(outcomes[0]));
        const rtp = anchor + this.weightedAverage(outcomes, totalWeight, (outcome) => effectiveRatio(outcome) - anchor);
        const hitFrequency = this.weightedAverage(outcomes, totalWeight, (outcome) => (outcome.payoutMultiplier > 0 ? 1 : 0));
        const zeroWinFrequency = this.weightedAverage(outcomes, totalWeight, (outcome) => (outcome.payoutMultiplier === 0 ? 1 : 0));
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
        if (!Number.isFinite(average)) {
            throw new Error("Standalone weighted average is not finite.");
        }
        return average;
    }

    // A probability mass function with exact integer bucket weights: one entry per exactly distinct payoutMultiplier value actually present
    // (grouped by strict numeric equality on Stake's own raw integer -- never on the reversed "ratio", so no
    // float-comparison ambiguity can ever merge or split a bucket), sorted ascending, with bounded decimal probabilities.
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
                weight: this.displayExactInteger(bucket.weight),
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
                occurrenceWeightByCategory.set(category, (occurrenceWeightByCategory.get(category) ?? StakeEngineStandaloneAnalyzer.ZERO) + weight);
                occurrenceCountWeightByCategory.set(category, (occurrenceCountWeightByCategory.get(category) ?? StakeEngineStandaloneAnalyzer.ZERO) + weight * BigInt(count));
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
            if (weight > StakeEngineStandaloneAnalyzer.ZERO && weight <= StakeEngineStandaloneAnalyzer.UINT64_MAX) {
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

    // Form at least 21 significant decimal digits with exact integer division, then round once into binary64.
    // Scaling follows the fraction's magnitude: there is no fixed absolute probability cutoff, and
    // common weight scaling produces identical doubles (including terminating decimals such as 0.1).
    private probabilityAsNumber(numerator: bigint, denominator: bigint): number {
        if (denominator <= StakeEngineStandaloneAnalyzer.ZERO) {
            throw new Error("Standalone probability requires a positive total weight.");
        }
        if (numerator === StakeEngineStandaloneAnalyzer.ZERO) return 0;
        const scale = 21 + denominator.toString().length - numerator.toString().length;
        const significand = numerator * BigInt("1" + "0".repeat(scale)) / denominator;
        return Number(`${significand}e-${scale}`);
    }

    // A decimal result can be represented exactly only when its reduced denominator factors into 2s and 5s. For
    // large totals, expose a deterministic decimal capped at 40 fractional digits, including terminating
    // fractions needing more digits. Integer accounting is exact; numeric moments are approximate.
    private displayFraction(numerator: bigint, denominator: bigint): StakeEngineStandaloneExactDecimal {
        if (numerator <= BigInt(Number.MAX_SAFE_INTEGER) && denominator <= BigInt(Number.MAX_SAFE_INTEGER)) {
            return this.probabilityAsNumber(numerator, denominator);
        }
        const whole = numerator / denominator;
        let remainder = numerator % denominator;
        if (remainder === StakeEngineStandaloneAnalyzer.ZERO) {
            return whole.toString();
        }
        let decimals = "";
        for (let index = 0; index < 40 && remainder !== StakeEngineStandaloneAnalyzer.ZERO; index += 1) {
            remainder *= StakeEngineStandaloneAnalyzer.TEN;
            decimals += (remainder / denominator).toString();
            remainder %= denominator;
        }
        return `${whole}.${decimals}`;
    }
}
