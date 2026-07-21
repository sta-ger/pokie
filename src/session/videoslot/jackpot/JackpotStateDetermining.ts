import type {JackpotPoolRepresenting} from "./JackpotPoolRepresenting.js";
import type {JackpotRoundOutcome} from "./JackpotRoundOutcome.js";

// The read side of VideoSlotWithJackpotSession's own state — exposed as a plain interface so
// JackpotRoundHandler can operate purely against a VideoSlotWithJackpotSessionHandling contract rather than
// the concrete decorator class (same reason FreeGamesRoundHandler/HoldAndWinRoundHandler take their own
// session-handling interfaces, not the concrete decorator).
export interface JackpotStateDetermining<T extends string | number | symbol = string> {
    // Fixed at construction time (see VideoSlotWithJackpotSession's own constructor) — no corresponding
    // setter, since the *list* of configured pools never changes over a session's lifetime, only each
    // pool's own internal value (via JackpotPoolRepresenting.contribute()/award()).
    getJackpotPools(): readonly JackpotPoolRepresenting[];

    getJackpotLastRoundOutcome(): JackpotRoundOutcome<T>;

    // Cumulative, always-correct jackpot statistics — deliberately *not* routed through
    // SimulationCategoryDetermining/AggregateSimulationRunner's own per-round breakdown, which reads a
    // session's category *before* play() but its payout *after* play() (see
    // VideoSlotWithJackpotSession's own getSimulationCategory() doc comment for why that ordering makes any
    // outcome-dependent category — "was the round that just played a jackpot win" — impossible to attribute
    // to the correct round through that mechanism). These two counters instead accumulate directly inside
    // JackpotRoundHandler itself, in real time, every single award — correct regardless of when or how
    // anything else happens to read them (mid-simulation, after it, or during live play), and persisted
    // through toSessionState()/fromSessionState() like any other durable session state.
    getJackpotAwardCount(): number;

    getJackpotTotalAwarded(): number;
}
