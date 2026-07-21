// Decides how much a single spin's own stake grows one jackpot pool by — called once per pool configured
// on the session (see JackpotRoundHandler), so a single JackpotContributing implementation can return
// different amounts for different pools (e.g. a lower rate for a "mini" tier than for "grand") by branching
// on "poolId"; the shipped default (PercentageOfBetJackpotContributor) ignores it and applies the same rate
// everywhere, which is the common case. Only ever consulted for a round that actually charged a real stake
// (stake > 0) — see JackpotRoundHandler, which never contributes anything for a zero-stake round (a free
// spin, or a respin of some other feature this session is stacked under).
export interface JackpotContributing {
    computeContribution(poolId: string, stake: number): number;
}
