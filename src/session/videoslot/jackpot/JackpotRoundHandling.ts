import type {WinEvaluationResult} from "../winevaluation/WinEvaluationResult.js";
import type {VideoSlotWithJackpotSessionHandling} from "./VideoSlotWithJackpotSessionHandling.js";

// Mirrors HoldAndWinRoundHandling's own role: the collaborator VideoSlotWithJackpotSession delegates its
// entire per-round contribution/trigger/award logic to, so the decorator itself stays a thin composition
// point.
export interface JackpotRoundHandling<T extends string | number | symbol = string> {
    // "stake" is what the round that just played actually charged (0 for a zero-stake round — see
    // JackpotTriggerContext's own doc comment); "baseWinEvaluationResult" is the wrapped session's own
    // getWinEvaluationResult() for that same round, read by VideoSlotWithJackpotSession *before* calling
    // this method, never re-read from "session" itself (session.getWinEvaluationResult() is this same
    // decorator's own overridden method, which by the time afterRoundPlayed() runs still reflects the
    // *previous* round's outcome — the same reason HoldAndWinRoundHandling.afterRoundPlayed() reads it this
    // way). Additive/optional from the start (unlike HoldAndWinRoundHandling.afterRoundPlayed()'s own
    // history — see that method's own doc comment on why it had to be *retrofitted* to optional after
    // shipping required): omitting it is equivalent to passing an empty WinEvaluationResult, meaning a round
    // that wins a jackpot will report a jackpot-only win (baseWinAmount 0) rather than combining it with
    // whatever the wrapped session's own round actually paid — safe, conservative, never fabricated.
    afterRoundPlayed(session: VideoSlotWithJackpotSessionHandling<T>, stake: number, baseWinEvaluationResult?: WinEvaluationResult<T>): void;
}
