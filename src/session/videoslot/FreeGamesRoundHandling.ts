import type {VideoSlotWithFreeGamesSessionHandling} from "./VideoSlotWithFreeGamesSessionHandling.js";

// The bank/retrigger bookkeeping around a single played round of a free-games bonus
// (accumulate wins during the run, pay out on completion, extend the run on a retrigger)
// is a strategy, not a fixed rule — implement this to model a different bonus mechanic
// (e.g. a progressive per-spin multiplier, or paying out immediately instead of banking).
export interface FreeGamesRoundHandling<T extends string | number | symbol = string> {
    beforeRoundPlayed(session: VideoSlotWithFreeGamesSessionHandling<T>): void;

    afterRoundPlayed(session: VideoSlotWithFreeGamesSessionHandling<T>, creditsBeforePlay: number): void;
}
