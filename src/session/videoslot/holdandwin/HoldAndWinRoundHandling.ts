import type {WinEvaluationResult} from "../winevaluation/WinEvaluationResult.js";
import type {VideoSlotWithHoldAndWinSessionHandling} from "./VideoSlotWithHoldAndWinSessionHandling.js";

// Mirrors FreeGamesRoundHandling's own role exactly: the collaborator VideoSlotWithHoldAndWinSession
// delegates its entire before/after-play state transition to, so the decorator itself stays a thin
// composition point (constructor wiring + a handful of method overrides) and every actual Hold & Win rule
// (trigger, locking, respin reset, completion, payout) lives in one replaceable strategy object instead of
// the decorator class.
export interface HoldAndWinRoundHandling<T extends string | number | symbol = string> {
    beforeRoundPlayed(session: VideoSlotWithHoldAndWinSessionHandling<T>): void;

    // "baseWinEvaluationResult" is the wrapped session's own getWinEvaluationResult(), read by
    // VideoSlotWithHoldAndWinSession *before* calling this method — never re-read from "session" itself
    // inside here, since session.getWinEvaluationResult() is this same decorator's own overridden method,
    // which by the time afterRoundPlayed() runs still reflects the *previous* round's outcome, not this
    // one (the whole reason HoldAndWinRoundOutcome exists as explicit state rather than something derived
    // on demand). This implementation decides for itself whether that value is still relevant to the round
    // it's finishing (a genuine paid trigger spin) or must be ignored (a respin, whose own win is always
    // discarded regardless of whether this call also completes the feature) — see HoldAndWinRoundHandler.
    afterRoundPlayed(session: VideoSlotWithHoldAndWinSessionHandling<T>, creditsBeforePlay: number, baseWinEvaluationResult: WinEvaluationResult<T>): void;
}
