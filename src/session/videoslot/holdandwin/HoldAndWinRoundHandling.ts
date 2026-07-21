import type {VideoSlotWithHoldAndWinSessionHandling} from "./VideoSlotWithHoldAndWinSessionHandling.js";

// Mirrors FreeGamesRoundHandling's own role exactly: the collaborator VideoSlotWithHoldAndWinSession
// delegates its entire before/after-play state transition to, so the decorator itself stays a thin
// composition point (constructor wiring + a handful of method overrides) and every actual Hold & Win rule
// (trigger, locking, respin reset, completion, payout) lives in one replaceable strategy object instead of
// the decorator class.
export interface HoldAndWinRoundHandling<T extends string | number | symbol = string> {
    beforeRoundPlayed(session: VideoSlotWithHoldAndWinSessionHandling<T>): void;

    afterRoundPlayed(session: VideoSlotWithHoldAndWinSessionHandling<T>, creditsBeforePlay: number): void;
}
