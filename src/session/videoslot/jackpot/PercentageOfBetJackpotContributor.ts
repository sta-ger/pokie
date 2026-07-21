import type {JackpotContributing} from "./JackpotContributing.js";

// The common real-world jackpot contribution rule: a fixed fraction of the stake, the same for every pool
// regardless of "poolId" (e.g. percentage = 0.01 contributes 1% of the stake to every configured pool each
// round). Swap in a different JackpotContributing implementation for a per-pool rate table, a flat
// (non-percentage) contribution, or anything else, without touching JackpotRoundHandler.
export class PercentageOfBetJackpotContributor implements JackpotContributing {
    private readonly percentage: number;

    constructor(percentage: number) {
        if (!Number.isFinite(percentage) || percentage < 0) {
            throw new Error(`PercentageOfBetJackpotContributor requires percentage to be a finite number >= 0, got ${String(percentage)}.`);
        }
        this.percentage = percentage;
    }

    public computeContribution(poolId: string, stake: number): number {
        return stake * this.percentage;
    }
}
