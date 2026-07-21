import type {HoldAndWinSymbolEffect} from "./HoldAndWinSymbolEffect.js";

// One symbol locked onto the grid during a Hold & Win/Lock & Spin feature — "position" is [reelId, rowId],
// matching the convention SymbolOverlayTransformer/SymbolsCombinationsAnalyzer already use everywhere else
// (e.g. getScatterSymbolsPositions, overlaySymbols). "effect" is captured once, at the moment this symbol is
// collected — never recomputed later — so a locked symbol's own contribution to the eventual payout stays
// fixed regardless of how the collector/payout aggregator configuration might change over the lifetime of a
// long-running feature (relevant mainly for deterministic replay: restoring mid-feature from a serialized
// VideoSlotWithHoldAndWinSessionState must reproduce the exact same locked symbols and effects, not
// recompute them from a possibly-different live configuration).
export type LockedHoldAndWinSymbol<T extends string | number | symbol = string> = {
    readonly position: readonly [number, number];
    readonly symbolId: T;
    readonly effect: HoldAndWinSymbolEffect;
};
