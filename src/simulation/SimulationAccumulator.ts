import {emptyObservationCounters, mergeObservationCounters, type SimulationObservationRequest, type SimulationObservationCounters} from "./SimulationObservationCounters.js";
import {emptyFeatureAnalytics, featureAnalyticsStatistics, mergeFeatureAnalytics, observeFeatureAnalytics, validateFeatureAnalytics, type AnalyticsEnvelope, type FeatureAnalyticsObservation, type FeatureAnalyticsSnapshot} from "./FeatureAnalytics.js";
import type {WeightedBonusStatistics} from "../session/videoslot/authored/WeightedBonus.js";
import {mergeWeightedBonusStatistics} from "./WeightedBonusStatisticsMerging.js";
import {mergeModifierStatistics, type ModifierStatistics} from "./ModifierStatistics.js";
import {mergeReelSequenceStatistics} from "./ReelSequenceStatisticsMerging.js";
import type {ReelSequenceStatistics} from "../session/videoslot/combinations/WeightedSequenceVariant.js";
import {emptyLogicalRoundStatistics, mergeLogicalRoundStatistics, mergeLogicalSamplingRanges, logicalSamplingAccounting, type LogicalSamplingRange, type LogicalRoundStatistics} from "./LogicalRoundStatistics.js";
import {ConfidenceIntervalCalculator} from "./ConfidenceIntervalCalculator.js";
import type {SimulationAccumulatorSnapshot} from "./SimulationAccumulatorSnapshot.js";
import type {SimulationStatistics} from "./SimulationStatistics.js";

export class SimulationAccumulator {
    private observations?: SimulationObservationCounters;
    private analytics?: FeatureAnalyticsSnapshot;
    private logicalSamplingRanges?: LogicalSamplingRange[];
    private logicalSamples?: SimulationAccumulator;
    private modifiers?: ModifierStatistics;
    private weightedBonus?: WeightedBonusStatistics;
    private reelSequences?: ReelSequenceStatistics[];
    private logicalRounds: LogicalRoundStatistics | undefined;
    private rounds = 0;
    private hitCount = 0;
    private totalBet = 0;
    private totalPayout = 0;
    private maxWin = 0;
    private maxWinCount = 0;
    private meanPayout = 0;
    private meanSquareDelta = 0;
    private meanReturnRatio = 0;
    private meanReturnRatioSquareDelta = 0;
    private meanBet = 0;
    private betSquareDelta = 0;
    private payoutBetCoMoment = 0;
    private readonly payoutHistogram: Record<string, number> = {};

    // The inverse of toSnapshot() — rehydrates a real SimulationAccumulator so its own merge() (the
    // online mean/variance algorithm) can be reused as-is, rather than reimplemented against plain
    // data.
    public static fromSnapshot(snapshot: SimulationAccumulatorSnapshot): SimulationAccumulator {
        validateSnapshot(snapshot);
        const accumulator = new SimulationAccumulator();
        accumulator.observations = mergeObservationCounters(undefined, snapshot.observations);
        accumulator.analytics = mergeFeatureAnalytics(undefined, snapshot.analytics);
        if (snapshot.weightedBonus) accumulator.setWeightedBonusStatistics(snapshot.weightedBonus);
        if (snapshot.reelSequences) accumulator.setReelSequenceStatistics(snapshot.reelSequences);
        accumulator.modifiers = snapshot.modifiers && {...snapshot.modifiers};
        if (snapshot.logicalSamplingRanges) accumulator.addLogicalSamplingRanges(snapshot.logicalSamplingRanges);
        accumulator.logicalRounds = snapshot.logicalRounds ? {...snapshot.logicalRounds} : undefined;
        if (snapshot.logicalSamples) accumulator.logicalSamples = SimulationAccumulator.fromSnapshot(snapshot.logicalSamples);
        accumulator.rounds = snapshot.rounds;
        accumulator.hitCount = snapshot.hitCount;
        accumulator.totalBet = snapshot.totalBet;
        accumulator.totalPayout = snapshot.totalPayout;
        accumulator.maxWin = snapshot.maxWin;
        accumulator.maxWinCount = snapshot.maxWinCount ?? 0;
        accumulator.meanPayout = snapshot.meanPayout;
        accumulator.meanSquareDelta = snapshot.meanSquareDelta;
        accumulator.meanReturnRatio = snapshot.meanReturnRatio;
        accumulator.meanReturnRatioSquareDelta = snapshot.meanReturnRatioSquareDelta;
        accumulator.meanBet = snapshot.meanBet ?? (snapshot.rounds > 0 ? snapshot.totalBet / snapshot.rounds : 0);
        accumulator.betSquareDelta = snapshot.betSquareDelta ?? 0;
        accumulator.payoutBetCoMoment = snapshot.payoutBetCoMoment ?? 0;
        Object.entries(snapshot.payoutHistogram).forEach(([bucket, count]) => {
            accumulator.payoutHistogram[bucket] = count;
        });
        return accumulator;
    }

    public configureObservations(request: SimulationObservationRequest): void {
        if (this.rounds) throw new Error("Observation request must precede simulation.");
        this.observations = emptyObservationCounters(request);
    }
    public observeRequestedMetrics(stake: number, payout: number, events: readonly string[]): void {
        if (!this.observations) return;
        if (!(stake > 0) || !Number.isFinite(stake) || !Number.isFinite(payout) || payout < 0) throw new Error("Requested payout-multiple observations require positive actual stake.");
        const multiple = payout / stake;
        if (!Number.isFinite(multiple)) throw new Error("Nonfinite payout multiple.");
        this.observations.observations++;
        this.observations.request.events.forEach((event, index) => {
            if (events.includes(event)) this.observations!.events[index]++;
        });
        this.observations.request.buckets.forEach((bucket, index) => {
            if (multiple >= bucket.min && (bucket.max === null || multiple < bucket.max)) this.observations!.buckets[index]++;
        });
    }

    public addModifierStatistics(observation: ModifierStatistics): void {
        validateModifierObservation(observation);
        this.modifiers = mergeModifierStatistics(this.modifiers, observation);
    }

    public setWeightedBonusStatistics(statistics: WeightedBonusStatistics): void {
        this.weightedBonus = mergeWeightedBonusStatistics(undefined, statistics);
    }

    public setReelSequenceStatistics(statistics: readonly ReelSequenceStatistics[]): void {
        this.reelSequences = mergeReelSequenceStatistics([], statistics);
    }


    public addLogicalSamplingRanges(ranges: LogicalSamplingRange[]): void {
        this.logicalSamplingRanges = mergeLogicalSamplingRanges(this.logicalSamplingRanges ?? [], ranges);
    }

    public enableLogicalRoundSampling(): void {
        this.logicalSamplingRanges ??= [];
        this.logicalSamples ??= new SimulationAccumulator();
        this.logicalRounds ??= emptyLogicalRoundStatistics();
    }

    public addLogicalRound(observation: LogicalRoundStatistics): void {
        if (!Number.isSafeInteger(observation.rounds) || observation.rounds < 0 || !Number.isSafeInteger(observation.steps) || observation.steps < observation.rounds || ![observation.totalStake, observation.totalWin].every(n => Number.isFinite(n) && n >= 0)) throw new Error("Invalid logical-round observation.");
        if (observation.rounds === 1) this.logicalSamples?.addRound(observation.totalStake, observation.totalWin);
        this.logicalRounds = mergeLogicalRoundStatistics(this.logicalRounds ?? emptyLogicalRoundStatistics(), observation);
    }

    public configureAnalytics(envelope: AnalyticsEnvelope): void {
        if (this.rounds > 0 && !this.analytics) throw new Error("Cannot attach current analytics provenance to unidentified historical rounds.");
        this.analytics = mergeFeatureAnalytics(this.analytics, emptyFeatureAnalytics(envelope));
    }

    public addRound(bet: number, payout: number, observation?: FeatureAnalyticsObservation): void {
        // Do this before changing *any* running total.  `NaN <= 0` is false in
        // JavaScript, so the old positivity-only guard let one bad game result
        // poison a whole report irreversibly.
        if (!Number.isFinite(bet) || bet < 0) {
            throw new Error(`SimulationAccumulator requires a finite bet >= 0, got ${bet}`);
        }
        if (!Number.isFinite(payout) || payout < 0) {
            throw new Error(`SimulationAccumulator requires a finite payout >= 0, got ${payout}`);
        }
        const historical = this.rounds > 0 && !this.analytics;
        if (historical && observation) throw new Error("Cannot append identified analytics to unidentified historical rounds; start an empty accumulator.");
        const analytics = historical ? undefined : mergeFeatureAnalytics(this.analytics, observeFeatureAnalytics(bet, payout, observation));
        this.analytics = analytics;
        this.rounds++;
        this.totalBet += bet;
        this.totalPayout += payout;
        if (payout > 0) {
            this.hitCount++;
        }
        if (payout > this.maxWin) {
            this.maxWin = payout;
            this.maxWinCount = payout > 0 ? 1 : 0;
        } else if (payout === this.maxWin && payout > 0) {
            this.maxWinCount++;
        }

        const delta = payout - this.meanPayout;
        this.meanPayout += delta / this.rounds;
        const delta2 = payout - this.meanPayout;
        this.meanSquareDelta += delta * delta2;

        const betDelta = bet - this.meanBet;
        this.meanBet += betDelta / this.rounds;
        this.betSquareDelta += betDelta * (bet - this.meanBet);
        this.payoutBetCoMoment += betDelta * (payout - this.meanPayout);

        // RTP is the ratio of all payouts to all paid stakes, never an
        // unweighted mean of per-spin ratios. The latter gives a $1 spin and
        // a $100 spin equal influence and is undefined for free rounds.
        this.meanReturnRatio = this.totalBet > 0 ? this.totalPayout / this.totalBet : 0;
        this.meanReturnRatioSquareDelta = 0;

        const bucket = this.getBucketLabel(payout);
        this.payoutHistogram[bucket] = (this.payoutHistogram[bucket] ?? 0) + 1;
    }

    public merge(other: SimulationAccumulator): void {
        validateSnapshot(this.toSnapshot());
        validateSnapshot(other.toSnapshot());
        if (this.rounds && !this.observations && other.observations || other.rounds && !other.observations && this.observations) throw new Error("Missing requested observation coverage.");
        const observations = mergeObservationCounters(this.observations, other.observations);
        const analytics = mergeFeatureAnalytics(this.analytics, other.analytics);
        if (this.rounds > 0 && !this.analytics && other.analytics || other.rounds > 0 && !other.analytics && this.analytics) throw new Error("Cannot merge missing analytics provenance with current observations.");
        const ranges = other.logicalSamplingRanges ? mergeLogicalSamplingRanges(this.logicalSamplingRanges ?? [], other.logicalSamplingRanges) : this.logicalSamplingRanges;
        const modifiers = mergeModifierStatistics(this.modifiers, other.modifiers);
        const bonus = mergeWeightedBonusStatistics(this.weightedBonus, other.weightedBonus);
        const sequences = other.reelSequences ? mergeReelSequenceStatistics(this.reelSequences, other.reelSequences) : this.reelSequences;
        const logicalRounds = other.logicalRounds ? mergeLogicalRoundStatistics(this.logicalRounds ?? emptyLogicalRoundStatistics(), other.logicalRounds) : this.logicalRounds;
        let logicalSamples = this.logicalSamples ? SimulationAccumulator.fromSnapshot(this.logicalSamples.toSnapshot()) : undefined;
        if (!logicalSamples && other.logicalSamples) logicalSamples = new SimulationAccumulator();
        if (other.logicalSamples) logicalSamples!.merge(other.logicalSamples);
        this.observations = observations;
        this.analytics = analytics;
        this.logicalSamplingRanges = ranges;
        this.modifiers = modifiers;
        this.weightedBonus = bonus;
        this.reelSequences = sequences;
        this.logicalRounds = logicalRounds;
        this.logicalSamples = logicalSamples;
        if (other.rounds === 0) {
            return;
        }
        if (this.rounds === 0) {
            this.rounds = other.rounds;
            this.hitCount = other.hitCount;
            this.totalBet = other.totalBet;
            this.totalPayout = other.totalPayout;
            this.maxWin = other.maxWin;
            this.maxWinCount = other.maxWinCount;
            this.meanPayout = other.meanPayout;
            this.meanSquareDelta = other.meanSquareDelta;
            this.meanReturnRatio = other.meanReturnRatio;
            this.meanReturnRatioSquareDelta = other.meanReturnRatioSquareDelta;
            this.meanBet = other.meanBet;
            this.betSquareDelta = other.betSquareDelta;
            this.payoutBetCoMoment = other.payoutBetCoMoment;
            Object.entries(other.payoutHistogram).forEach(([bucket, count]) => {
                this.payoutHistogram[bucket] = count;
            });
            return;
        }

        const combinedRounds = this.rounds + other.rounds;
        const delta = other.meanPayout - this.meanPayout;
        this.meanSquareDelta =
            this.meanSquareDelta +
            other.meanSquareDelta +
            (delta * delta * this.rounds * other.rounds) / combinedRounds;
        this.meanPayout = (this.meanPayout * this.rounds + other.meanPayout * other.rounds) / combinedRounds;
        const betDelta = other.meanBet - this.meanBet;
        // The previous means are recovered from totals, which have not yet
        // been updated below.
        const thisMeanPayout = this.totalPayout / this.rounds;
        const otherMeanPayout = other.totalPayout / other.rounds;
        this.payoutBetCoMoment += other.payoutBetCoMoment + (betDelta * (otherMeanPayout - thisMeanPayout) * this.rounds * other.rounds) / combinedRounds;
        this.betSquareDelta += other.betSquareDelta + (betDelta * betDelta * this.rounds * other.rounds) / combinedRounds;
        this.meanBet = (this.meanBet * this.rounds + other.meanBet * other.rounds) / combinedRounds;
        this.rounds = combinedRounds;
        this.hitCount += other.hitCount;
        this.totalBet += other.totalBet;
        this.totalPayout += other.totalPayout;
        this.meanReturnRatio = this.totalBet > 0 ? this.totalPayout / this.totalBet : 0;
        this.meanReturnRatioSquareDelta = 0;
        if (other.maxWin > this.maxWin) {
            this.maxWin = other.maxWin;
            this.maxWinCount = other.maxWinCount;
        } else if (other.maxWin === this.maxWin) {
            this.maxWinCount += other.maxWinCount;
        }
        Object.entries(other.payoutHistogram).forEach(([bucket, count]) => {
            this.payoutHistogram[bucket] = (this.payoutHistogram[bucket] ?? 0) + count;
        });
    }

    public getStatistics(): SimulationStatistics {
        const payoutVariance = this.rounds > 0 ? this.meanSquareDelta / this.rounds : 0;
        const payoutStandardDeviation = Math.sqrt(payoutVariance);
        // Delta-method standard deviation for ratio-of-totals.  It is defined
        // with zero-stake free continuations and variable paid stakes alike.
        const rtp = this.totalBet > 0 ? this.totalPayout / this.totalBet : 0;
        const residualVariance = this.rounds > 0
            ? Math.max(0, (this.meanSquareDelta - 2 * rtp * this.payoutBetCoMoment + rtp * rtp * this.betSquareDelta) / this.rounds)
            : 0;
        const returnStandardDeviation = this.meanBet > 0 ? Math.sqrt(residualVariance) / this.meanBet : 0;
        const averageBet = this.rounds > 0 ? this.totalBet / this.rounds : 0;
        const averagePayout = this.rounds > 0 ? this.totalPayout / this.rounds : 0;
        const averagePayoutConfidenceInterval95 = ConfidenceIntervalCalculator.calculate95(
            averagePayout,
            payoutStandardDeviation,
            this.rounds,
        );
        return {
            ...(this.observations ? {observations: mergeObservationCounters(undefined, this.observations)} : {}),
            ...(this.modifiers ? {modifiers: {...this.modifiers}} : {}),
            ...(this.weightedBonus ? {weightedBonus: mergeWeightedBonusStatistics(undefined, this.weightedBonus)} : {}),
            ...(this.reelSequences ? {reelSequences: mergeReelSequenceStatistics([], this.reelSequences)} : {}),
            ...(this.logicalRounds ? {logicalRounds: {...this.logicalRounds}} : {}),
            ...(this.logicalSamplingRanges ? {logicalSampling: logicalSamplingAccounting(this.logicalSamplingRanges)} : {}),
            ...(this.logicalSamples ? {logicalRoundMetrics: this.logicalSamples.getStatistics()} : {}),
            ...(this.analytics ? {analytics: featureAnalyticsStatistics(this.analytics)} : {}),
            rounds: this.rounds,
            hitCount: this.hitCount,
            totalBet: this.totalBet,
            totalPayout: this.totalPayout,
            averageBet,
            averagePayout,
            averagePayoutConfidenceInterval95,
            rtp,
            rtpConfidenceInterval95: ConfidenceIntervalCalculator.calculate95(
                rtp,
                returnStandardDeviation,
                this.rounds,
            ),
            volatility: payoutStandardDeviation,
            payoutStandardDeviation,
            returnStandardDeviation,
            maxWin: this.maxWin,
            maxWinFrequency: this.rounds > 0 && this.maxWin > 0 ? this.maxWinCount / this.rounds : 0,
            payoutHistogram: {...this.payoutHistogram},
        };
    }

    // Exposes the running-totals state a worker thread needs to ship back to the coordinator for
    // merging (see SimulationStatisticsMerger) — a live SimulationAccumulator instance can't cross a
    // worker_threads boundary itself, but this plain snapshot can.
    public toSnapshot(): SimulationAccumulatorSnapshot {
        return {
            ...(this.observations ? {observations: mergeObservationCounters(undefined, this.observations)} : {}),
            ...(this.modifiers ? {modifiers: {...this.modifiers}} : {}),
            ...(this.weightedBonus ? {weightedBonus: mergeWeightedBonusStatistics(undefined, this.weightedBonus)} : {}),
            ...(this.reelSequences ? {reelSequences: mergeReelSequenceStatistics([], this.reelSequences)} : {}),
            ...(this.logicalRounds ? {logicalRounds: {...this.logicalRounds}} : {}),
            ...(this.logicalSamplingRanges ? {logicalSamplingRanges: mergeLogicalSamplingRanges([], this.logicalSamplingRanges)} : {}),
            ...(this.logicalSamples ? {logicalSamples: this.logicalSamples.toSnapshot()} : {}),
            ...(this.analytics ? {analytics: mergeFeatureAnalytics(undefined, this.analytics)} : {}),
            rounds: this.rounds,
            hitCount: this.hitCount,
            totalBet: this.totalBet,
            totalPayout: this.totalPayout,
            maxWin: this.maxWin,
            maxWinCount: this.maxWinCount,
            meanPayout: this.meanPayout,
            meanSquareDelta: this.meanSquareDelta,
            meanReturnRatio: this.meanReturnRatio,
            meanReturnRatioSquareDelta: this.meanReturnRatioSquareDelta,
            meanBet: this.meanBet,
            betSquareDelta: this.betSquareDelta,
            payoutBetCoMoment: this.payoutBetCoMoment,
            payoutHistogram: {...this.payoutHistogram},
        };
    }

    private getBucketLabel(payout: number): string {
        if (payout === 0) {
            return "0";
        }
        if (payout < 10) {
            return "1-9";
        }
        if (payout < 100) {
            return "10-99";
        }
        return "100+";
    }
}

function validateSnapshot(snapshot: SimulationAccumulatorSnapshot): void {
    if (snapshot.observations) {
        mergeObservationCounters(undefined, snapshot.observations);
        if (snapshot.observations.observations !== snapshot.rounds) throw new Error("Requested observation coverage disagrees with accepted rounds.");
    }
    if (snapshot.analytics) {
        validateFeatureAnalytics(snapshot.analytics);
        if (snapshot.analytics.subrounds !== snapshot.rounds || snapshot.analytics.totalStake !== snapshot.totalBet || snapshot.analytics.totalWin !== snapshot.totalPayout || snapshot.analytics.deadSpins !== snapshot.rounds - snapshot.hitCount || snapshot.analytics.maxWin !== snapshot.maxWin || snapshot.maxWin > 0 && snapshot.analytics.maxWinCount !== snapshot.maxWinCount) throw new Error("Analytics snapshot totals disagree with accumulator.");
    }
    if (snapshot.logicalSamplingRanges !== undefined && (!Array.isArray(snapshot.logicalSamplingRanges) || snapshot.logicalSamplingRanges.some(range =>
        !range || range.excluded !== undefined && (!Number.isSafeInteger(range.excluded) || range.excluded < 0) || typeof range.trajectory !== "string" || !range.trajectory ||
        ![range.observed, range.completed, range.abandoned ?? []].every(ranges => Array.isArray(ranges) && ranges.every(pair => Array.isArray(pair) && pair.length === 2 && pair.every(n => Number.isSafeInteger(n) && n >= 0) && pair[1] >= pair[0]))))) throw new Error("Invalid logical sampling ranges.");
    if (snapshot.logicalSamples && (snapshot.logicalSamples.logicalSamples || snapshot.logicalSamples.rounds !== snapshot.logicalRounds?.rounds)) throw new Error("Invalid logical sample snapshot envelope.");
    if (snapshot.modifiers !== undefined) validateModifierObservation(snapshot.modifiers);
    const nonNegativeIntegers: Array<[string, number]> = [
        ["rounds", snapshot.rounds],
        ["hitCount", snapshot.hitCount],
        ...(snapshot.maxWinCount === undefined ? [] : [["maxWinCount", snapshot.maxWinCount] as [string, number]]),
    ];
    for (const [name, value] of nonNegativeIntegers) {
        if (!Number.isSafeInteger(value) || value < 0) {
            throw new Error(`SimulationAccumulator snapshot has invalid ${name}: ${value}.`);
        }
    }
    if (snapshot.logicalRounds && (!Number.isSafeInteger(snapshot.logicalRounds.rounds) || snapshot.logicalRounds.rounds < 0 || !Number.isSafeInteger(snapshot.logicalRounds.steps) || snapshot.logicalRounds.steps < snapshot.logicalRounds.rounds || ![snapshot.logicalRounds.totalStake, snapshot.logicalRounds.totalWin].every(n => Number.isFinite(n) && n >= 0))) throw new Error("Invalid logical-round statistics snapshot.");
    if (snapshot.hitCount > snapshot.rounds) {
        throw new Error(`SimulationAccumulator snapshot hitCount cannot exceed rounds.`);
    }
    if (snapshot.maxWinCount !== undefined && snapshot.maxWinCount > snapshot.rounds) {
        throw new Error(`SimulationAccumulator snapshot maxWinCount cannot exceed rounds.`);
    }
    const finiteNonNegative: Array<[string, number]> = [
        ["totalBet", snapshot.totalBet],
        ["totalPayout", snapshot.totalPayout],
        ["maxWin", snapshot.maxWin],
        ["meanPayout", snapshot.meanPayout],
        ["meanSquareDelta", snapshot.meanSquareDelta],
        ["meanReturnRatio", snapshot.meanReturnRatio],
        ["meanReturnRatioSquareDelta", snapshot.meanReturnRatioSquareDelta],
        ...(snapshot.meanBet === undefined ? [] : [["meanBet", snapshot.meanBet] as [string, number]]),
        ...(snapshot.betSquareDelta === undefined ? [] : [["betSquareDelta", snapshot.betSquareDelta] as [string, number]]),
    ];
    for (const [name, value] of finiteNonNegative) {
        if (!Number.isFinite(value) || value < 0) {
            throw new Error(`SimulationAccumulator snapshot has invalid ${name}: ${value}.`);
        }
    }
    if (snapshot.payoutBetCoMoment !== undefined && !Number.isFinite(snapshot.payoutBetCoMoment)) {
        throw new Error(`SimulationAccumulator snapshot has invalid payoutBetCoMoment: ${snapshot.payoutBetCoMoment}.`);
    }
    for (const [bucket, count] of Object.entries(snapshot.payoutHistogram)) {
        if (!["0", "1-9", "10-99", "100+"].includes(bucket)) throw new Error("Invalid simulation payout histogram bucket; only the four fixed buckets are supported.");
        if (!Number.isSafeInteger(count) || count < 0) {
            throw new Error(`SimulationAccumulator snapshot has invalid payoutHistogram count for ${JSON.stringify(bucket)}: ${count}.`);
        }
    }
}

function validateModifierObservation(observation: ModifierStatistics): void {
    const fields: Array<keyof ModifierStatistics> = ["steps", "ruleApplications", "stickySteps", "multipliedComponents"];
    if (!observation || Object.keys(observation).length !== fields.length || fields.some(key => !Number.isSafeInteger(observation[key]) || observation[key] < 0)) throw new Error("Invalid modifier statistics observation.");
}
