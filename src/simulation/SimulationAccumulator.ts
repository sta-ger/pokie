import {ConfidenceIntervalCalculator, SimulationStatistics} from "pokie";

export class SimulationAccumulator {
    private rounds = 0;
    private hitCount = 0;
    private totalBet = 0;
    private totalPayout = 0;
    private maxWin = 0;
    private meanPayout = 0;
    private meanSquareDelta = 0;
    private meanReturnRatio = 0;
    private meanReturnRatioSquareDelta = 0;
    private readonly payoutHistogram: Record<string, number> = {};

    public addRound(bet: number, payout: number): void {
        if (bet <= 0) {
            throw new Error(`SimulationAccumulator requires bet > 0, got ${bet}`);
        }
        this.rounds++;
        this.totalBet += bet;
        this.totalPayout += payout;
        if (payout > 0) {
            this.hitCount++;
        }
        if (payout > this.maxWin) {
            this.maxWin = payout;
        }

        const delta = payout - this.meanPayout;
        this.meanPayout += delta / this.rounds;
        const delta2 = payout - this.meanPayout;
        this.meanSquareDelta += delta * delta2;

        const returnRatio = payout / bet;
        const returnDelta = returnRatio - this.meanReturnRatio;
        this.meanReturnRatio += returnDelta / this.rounds;
        const returnDelta2 = returnRatio - this.meanReturnRatio;
        this.meanReturnRatioSquareDelta += returnDelta * returnDelta2;

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
            this.meanPayout = other.meanPayout;
            this.meanSquareDelta = other.meanSquareDelta;
            this.meanReturnRatio = other.meanReturnRatio;
            this.meanReturnRatioSquareDelta = other.meanReturnRatioSquareDelta;
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
        const returnDelta = other.meanReturnRatio - this.meanReturnRatio;
        this.meanReturnRatioSquareDelta =
            this.meanReturnRatioSquareDelta +
            other.meanReturnRatioSquareDelta +
            (returnDelta * returnDelta * this.rounds * other.rounds) / combinedRounds;
        this.meanReturnRatio =
            (this.meanReturnRatio * this.rounds + other.meanReturnRatio * other.rounds) / combinedRounds;
        this.rounds = combinedRounds;
        this.hitCount += other.hitCount;
        this.totalBet += other.totalBet;
        this.totalPayout += other.totalPayout;
        this.maxWin = Math.max(this.maxWin, other.maxWin);
        Object.entries(other.payoutHistogram).forEach(([bucket, count]) => {
            this.payoutHistogram[bucket] = (this.payoutHistogram[bucket] ?? 0) + count;
        });
    }

    public getStatistics(): SimulationStatistics {
        const payoutVariance = this.rounds > 0 ? this.meanSquareDelta / this.rounds : 0;
        const payoutStandardDeviation = Math.sqrt(payoutVariance);
        const returnVariance = this.rounds > 0 ? this.meanReturnRatioSquareDelta / this.rounds : 0;
        const returnStandardDeviation = Math.sqrt(returnVariance);
        const averageBet = this.rounds > 0 ? this.totalBet / this.rounds : 0;
        const averagePayout = this.rounds > 0 ? this.totalPayout / this.rounds : 0;
        const averagePayoutConfidenceInterval95 = ConfidenceIntervalCalculator.calculate95(
            averagePayout,
            payoutStandardDeviation,
            this.rounds,
        );
        const rtp = this.rounds > 0 ? this.meanReturnRatio : 0;
        return {
            rounds: this.rounds,
            hitCount: this.hitCount,
            totalBet: this.totalBet,
            totalPayout: this.totalPayout,
            averageBet,
            averagePayout,
            averagePayoutConfidenceInterval95,
            rtp,
            rtpConfidenceInterval95: ConfidenceIntervalCalculator.calculate95(rtp, returnStandardDeviation, this.rounds),
            volatility: payoutStandardDeviation,
            payoutStandardDeviation,
            returnStandardDeviation,
            maxWin: this.maxWin,
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
