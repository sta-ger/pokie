import type {LockedHoldAndWinSymbol} from "./LockedHoldAndWinSymbol.js";

// Mirrors FreeGamesStateSetting's own role: the write side of VideoSlotWithHoldAndWinSession's own state —
// mutated only by HoldAndWinRoundHandler (during beforeRoundPlayed/afterRoundPlayed) and by
// VideoSlotWithHoldAndWinSession's own fromSessionState() when restoring a serialized state.
export interface HoldAndWinStateSetting<T extends string | number | symbol = string> {
    setHoldAndWinActive(value: boolean): void;

    setLockedHoldAndWinSymbols(value: readonly LockedHoldAndWinSymbol<T>[]): void;

    setHoldAndWinRespinsRemaining(value: number): void;

    setHoldAndWinPayout(value: number): void;
}
