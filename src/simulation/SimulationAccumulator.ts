import {ConfidenceIntervalCalculator} from "./ConfidenceIntervalCalculator.js";
import type {SimulationAccumulatorSnapshot} from "./SimulationAccumulatorSnapshot.js";
import type {SimulationStatistics} from "./SimulationStatistics.js";

export class SimulationAccumulator {
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

    public addRound(bet: number, payout: number): void {
        // Do this before changing *any* running total.  `NaN <= 0` is false in
        // JavaScript, so the old positivity-only guard let one bad game result
        // poison a whole report irreversibly.
        if (!Number.isFinite(bet) || bet < 0) {
            throw new Error(`SimulationAccumulator requires a finite bet >= 0, got ${bet}`);
        }
        if (!Number.isFinite(payout) || payout < 0) {
            throw new Error(`SimulationAccumulator requires a finite payout >= 0, got ${payout}`);
        }
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
        if (!Number.isSafeInteger(count) || count < 0) {
            throw new Error(`SimulationAccumulator snapshot has invalid payoutHistogram count for ${JSON.stringify(bucket)}: ${count}.`);
        }
    }
}
