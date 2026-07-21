import type {HoldAndWinBaseRoundResult} from "./HoldAndWinBaseRoundResult.js";
import type {VideoSlotWithHoldAndWinSessionHandling} from "./VideoSlotWithHoldAndWinSessionHandling.js";

// Mirrors FreeGamesRoundHandling's own role exactly: the collaborator VideoSlotWithHoldAndWinSession
// delegates its entire before/after-play state transition to, so the decorator itself stays a thin
// composition point (constructor wiring + a handful of method overrides) and every actual Hold & Win rule
// (trigger, locking, respin reset, completion, payout) lives in one replaceable strategy object instead of
// the decorator class.
export interface HoldAndWinRoundHandling<T extends string | number | symbol = string> {
    beforeRoundPlayed(session: VideoSlotWithHoldAndWinSessionHandling<T>): void;

    // "baseRoundResult" is a snapshot of the wrapped session's own paytable result for the spin that just
    // played (see HoldAndWinBaseRoundResult's own doc comment), read by VideoSlotWithHoldAndWinSession
    // *before* calling this method — never re-read from "session" itself inside here, since e.g.
    // session.getWinEvaluationResult() is this same decorator's own overridden method, which by the time
    // afterRoundPlayed() runs still reflects the *previous* round's outcome, not this one (the whole reason
    // HoldAndWinRoundOutcome exists as explicit state rather than something derived on demand). This
    // implementation decides for itself whether that snapshot is still relevant to the round it's finishing
    // (a genuine paid trigger spin) or must be ignored (a respin, whose own result is always discarded
    // regardless of whether this call also completes the feature) — see HoldAndWinRoundHandler.
    //
    // Additive/optional (backward compatible with the original 2-argument shape this method shipped with):
    // omitting it is equivalent to passing emptyHoldAndWinBaseRoundResult() — safe, conservative, but unable
    // to distinguish a genuine paid base win from "nothing" for whichever round it's omitted on (see
    // HoldAndWinRoundHandler's own doc comment on the resulting, deliberately narrow, degradation).
    afterRoundPlayed(session: VideoSlotWithHoldAndWinSessionHandling<T>, creditsBeforePlay: number, baseRoundResult?: HoldAndWinBaseRoundResult<T>): void;
}
