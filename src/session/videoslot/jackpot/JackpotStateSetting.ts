import type {JackpotRoundOutcome} from "./JackpotRoundOutcome.js";

// The write side of VideoSlotWithJackpotSession's own state — mutated only by JackpotRoundHandler, exactly
// once per afterRoundPlayed() call.
export interface JackpotStateSetting<T extends string | number | symbol = string> {
    setJackpotLastRoundOutcome(value: JackpotRoundOutcome<T>): void;

    setJackpotAwardCount(value: number): void;

    setJackpotTotalAwarded(value: number): void;
}
