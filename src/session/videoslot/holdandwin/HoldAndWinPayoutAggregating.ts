import type {LockedHoldAndWinSymbol} from "./LockedHoldAndWinSymbol.js";

// Folds a completed feature's own final locked-symbol set into a single payout amount (credits), given the
// bet the triggering spin was played at. This is the "pool primitive" GAP_AUDIT_v1.3.md names as the one
// genuinely new piece of domain logic Hold & Win needs beyond existing win-calculation primitives — summing
// values and applying multipliers is a different aggregation shape than any existing WinCalculating
// implementation produces (those all evaluate a single spin's own grid; this folds an entire feature run's
// worth of independently-collected symbols instead). Only ever called once, at the exact moment
// HoldAndWinRoundHandler determines the feature has finished (board full or respins exhausted) — never
// mid-feature, so an aggregator never has to handle a partial/still-growing locked set.
export interface HoldAndWinPayoutAggregating<T extends string | number | symbol = string> {
    aggregate(lockedSymbols: readonly LockedHoldAndWinSymbol<T>[], bet: number): number;
}
