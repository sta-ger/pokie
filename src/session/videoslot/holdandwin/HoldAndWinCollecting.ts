import type {LockedHoldAndWinSymbol} from "./LockedHoldAndWinSymbol.js";

// Detects which positions on a freshly generated grid are eligible to become newly locked, given the
// positions already locked from earlier spins/respins of the same feature run. Used uniformly for two
// distinct purposes by HoldAndWinRoundHandler: deciding what a *triggering* base spin would lock (called
// with an empty "alreadyLocked"), and deciding what a *respin* newly collects (called with the feature's
// current locked set) — one primitive, not two, since both are really the same question ("what's
// collectible on this grid that isn't accounted for yet"). Implementations must never return a position
// already present in "alreadyLocked" — HoldAndWinRoundHandler relies on that to treat every returned
// element as unconditionally new.
export interface HoldAndWinCollecting<T extends string | number | symbol = string> {
    collect(symbols: readonly (readonly T[])[], alreadyLocked: readonly LockedHoldAndWinSymbol<T>[]): readonly LockedHoldAndWinSymbol<T>[];
}
