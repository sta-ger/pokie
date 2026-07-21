import type {JackpotTriggerContext} from "./JackpotTriggerContext.js";

// Decides whether the round that just played wins a jackpot at all — a single yes/no decision for the whole
// round, never per-pool (see JackpotAwarding for *which* pool/tier, once this says yes). Deliberately has no
// access to the session itself, only the plain JackpotTriggerContext snapshot JackpotRoundHandler builds —
// keeps every implementation trivially unit-testable against fixed inputs, the same reason
// HoldAndWinTriggering/HoldAndWinCollecting are shaped this way.
export interface JackpotTriggering<T extends string | number | symbol = string> {
    isTriggered(context: JackpotTriggerContext<T>): boolean;
}
