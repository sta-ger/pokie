import type {JackpotPoolStatisticsSnapshot} from "../../JackpotStatisticsSnapshot.js";
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

    // Cumulative, always-correct jackpot statistics, keyed by each configured pool's own getId() — the
    // single source of truth for every other jackpot statistic below, and for
    // getJackpotStatisticsSnapshot() (see JackpotStatisticsProviding). Deliberately *not* routed through
    // SimulationCategoryDetermining/AggregateSimulationRunner's own per-round breakdown, which reads a
    // session's category *before* play() but its payout *after* play() (see
    // VideoSlotWithJackpotSession's own getSimulationCategory() doc comment for why that ordering makes any
    // outcome-dependent category — "was the round that just played a jackpot win" — impossible to attribute
    // to the correct round through that mechanism). Updated directly inside JackpotRoundHandler itself, in
    // real time, on every contribution and every award — correct regardless of when or how anything else
    // happens to read it (mid-simulation, after it, or during live play) — and persisted through
    // toSessionState()/fromSessionState() like any other durable session state.
    getJackpotPoolStatistics(): Readonly<Record<string, JackpotPoolStatisticsSnapshot>>;

    // Convenience sums across every entry of getJackpotPoolStatistics() — never independently settable,
    // never a second source of truth that could drift from the per-pool map.
    getJackpotAwardCount(): number;

    getJackpotTotalAwarded(): number;

    getJackpotTotalContributed(): number;
}
