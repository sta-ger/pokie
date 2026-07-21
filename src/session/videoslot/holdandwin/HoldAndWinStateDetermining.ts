import type {HoldAndWinRoundOutcome} from "./HoldAndWinRoundOutcome.js";
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

    // The most recently played round's own definitive result — see HoldAndWinRoundOutcome's own doc comment
    // on why this exists as explicit state rather than something derived from isHoldAndWinActive() at
    // read time. This is purely in-memory/transient — deliberately not part of
    // VideoSlotWithHoldAndWinSessionState (see that type's own doc comment): it answers "what did the round
    // that just played actually pay", the same role a plain VideoSlotSession's own live winAmount plays,
    // never something a restore needs to reconstruct.
    getHoldAndWinLastRoundOutcome(): HoldAndWinRoundOutcome<T>;
}
