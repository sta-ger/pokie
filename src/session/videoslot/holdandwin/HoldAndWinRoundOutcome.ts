import type {HoldAndWinBaseRoundResult} from "./HoldAndWinBaseRoundResult.js";
import type {LockedHoldAndWinSymbol} from "./LockedHoldAndWinSymbol.js";

// What the *most recently played* round's own definitive result actually was — set explicitly by
// HoldAndWinRoundHandler on every single afterRoundPlayed() call, never left for
// VideoSlotWithHoldAndWinSession's own getWinAmount()/getWinEvaluationResult() overrides to infer from
// isHoldAndWinActive() after the fact. Deriving it from "active" alone would get every one of the four cases
// below wrong at least once: "active" is already true again by the time a *triggering* spin's own result is
// read (trigger detection runs inside the very afterRoundPlayed() call that flips it), and "active" is false
// both for an ordinary spin AND for the one respin that just completed the feature — two states requiring
// opposite getWinAmount() behavior (the wrapped session's own win vs. the aggregated payout) that "active"
// alone cannot distinguish between.
//
// - "ordinary": a plain spin the feature had no say in — either a base spin that didn't trigger, or the one
//   triggering spin itself (see the class doc comment on VideoSlotWithHoldAndWinSession: a trigger spin's
//   own base win always stands unchanged unless it *also* immediately completes the feature, in which case
//   the outcome is "completed", not "ordinary" — the two are mutually exclusive per round). getWinAmount()
//   forwards straight to the wrapped session; nothing about this round involved Hold & Win.
// - "suppressed": a respin whose own wrapped-paytable win was collected then discarded (credits restored to
//   their pre-play value — see HoldAndWinRoundHandler) without completing the feature. getWinAmount() must
//   report 0 here, not whatever number the wrapped session's own reel strip happened to compute — that
//   number was never actually paid out.
// - "completed": the round that ended the feature — either a respin whose own (always-suppressed, hence
//   baseWinAmount always 0 here, and baseRoundResult always the empty fallback) win doesn't matter, or the
//   rare case of the *triggering* spin alone filling the entire board (baseWinAmount/baseRoundResult are
//   that spin's own real, already-paid wrapped result). getWinAmount() must report baseWinAmount + payout —
//   both components actually apply to credits this round, see HoldAndWinRoundHandler's own complete().
//   "baseRoundResult" carries the full snapshot (win evaluation result, legacy lines/scatters maps) so the
//   legacy result APIs (getWinningLines()/getWinningScatters()/etc. on VideoSlotWithHoldAndWinSession) can
//   also be outcome-aware, not just getWinAmount()/getWinEvaluationResult() — "baseWinAmount" is kept
//   alongside it purely as a convenience (it's always exactly baseRoundResult.winEvaluationResult.getTotalWin()).
export type HoldAndWinRoundOutcome<T extends string | number | symbol = string> =
    | {readonly kind: "ordinary"}
    | {readonly kind: "suppressed"}
    | {
          readonly kind: "completed";
          readonly baseWinAmount: number;
          readonly payout: number;
          readonly lockedSymbols: readonly LockedHoldAndWinSymbol<T>[];
          readonly baseRoundResult: HoldAndWinBaseRoundResult<T>;
      };
