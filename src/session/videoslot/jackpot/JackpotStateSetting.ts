import type {JackpotPoolStatisticsSnapshot} from "../../JackpotStatisticsSnapshot.js";
import type {JackpotRoundOutcome} from "./JackpotRoundOutcome.js";

// The write side of VideoSlotWithJackpotSession's own state — mutated only by JackpotRoundHandler, exactly
// once per afterRoundPlayed() call.
export interface JackpotStateSetting<T extends string | number | symbol = string> {
    setJackpotLastRoundOutcome(value: JackpotRoundOutcome<T>): void;

    // Whole-map replacement, the same "immutable update, replace the whole value" convention
    // setLockedHoldAndWinSymbols()/setHoldAndWinLastRoundOutcome() already use — JackpotRoundHandler computes
    // an updated map (see its own applyJackpotPoolStatisticsDelta() helper) and sets it back in one call, no
    // fine-grained per-pool setter.
    setJackpotPoolStatistics(value: Readonly<Record<string, JackpotPoolStatisticsSnapshot>>): void;
}
