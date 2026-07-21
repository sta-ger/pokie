// What a locked Hold & Win symbol actually contributes at payout time — deliberately a small, open
// discriminated union rather than a single "value" number, so a payout aggregator can treat coin/value
// symbols and multiplier symbols differently (see HoldAndWinPayoutAggregating). "value" is a flat
// contribution (interpreted as either flat credits or a bet-multiple, entirely up to the aggregator in
// use — see SumWithMultiplierHoldAndWinPayoutAggregator's own doc comment); "multiplier" never
// contributes credits on its own, it only scales whatever "value" total the aggregator computes.
export type HoldAndWinSymbolEffect = {readonly kind: "value"; readonly amount: number} | {readonly kind: "multiplier"; readonly factor: number};
