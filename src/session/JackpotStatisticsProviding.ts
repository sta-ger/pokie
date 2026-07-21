import type {JackpotStatisticsSnapshot} from "./JackpotStatisticsSnapshot.js";

// Optional, feature-detected capability (same pattern as StakeAmountDetermining/SimulationCategoryDetermining):
// a GameSessionHandling implementation MAY implement this to expose its own jackpot-specific simulation
// statistics as a single, plain-data snapshot — read once per simulation run/chunk (see
// AggregateSimulationRunner.getJackpotStatistics()) and merged across parallel workers via
// mergeJackpotStatisticsSnapshots (src/simulation/JackpotStatisticsMerging.ts).
//
// Deliberately NOT derived from SimulationCategoryDetermining/AggregateSimulationRunner's own per-round
// category breakdown — that mechanism reads a session's category *before* play() but its payout *after*
// play(), so any statistic only knowable once a round has actually finished (like "did this round award a
// jackpot") would get attributed to the *wrong* round through that channel (see
// VideoSlotWithJackpotSession's own getSimulationCategory() doc comment for the full reasoning). This
// snapshot is instead read once, after however many rounds have played, directly reflecting the session's
// own live cumulative state — correct regardless of when or how many times it's read.
export interface JackpotStatisticsProviding {
    getJackpotStatisticsSnapshot(): JackpotStatisticsSnapshot;
}
