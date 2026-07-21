import type {LockedHoldAndWinSymbol} from "./LockedHoldAndWinSymbol.js";

// Mirrors FreeGamesStateDetermining's own role for the free-games decorator: the read side of
// VideoSlotWithHoldAndWinSession's own state, exposed as a plain interface so HoldAndWinRoundHandler can
// operate purely against a VideoSlotWithHoldAndWinSessionHandling contract rather than the concrete
// decorator class (same reason FreeGamesRoundHandler takes VideoSlotWithFreeGamesSessionHandling, not
// VideoSlotWithFreeGamesSession).
export interface HoldAndWinStateDetermining<T extends string | number | symbol = string> {
    isHoldAndWinActive(): boolean;

    getLockedHoldAndWinSymbols(): readonly LockedHoldAndWinSymbol<T>[];

    getHoldAndWinRespinsRemaining(): number;

    // The completed feature's own aggregated payout — 0 both before the feature has ever triggered and
    // again once a fresh, unrelated round starts after it finished (see HoldAndWinRoundHandler's own
    // beforeRoundPlayed). Only meaningfully nonzero for the one round that just completed the feature.
    getHoldAndWinPayout(): number;
}
