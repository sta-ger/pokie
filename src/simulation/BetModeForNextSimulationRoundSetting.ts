import type {GameSessionHandling} from "../session/GameSessionHandling.js";

// Mirrors BetForNextSimulationRoundSetting's shape (a "before this round" hook AggregateSimulationRunner
// consults, when supplied, right alongside the existing bet-changing strategy) but for locking a
// specific bet mode across a whole simulation run instead of changing the bet amount. See
// FixedBetModeForNextSimulationRoundSetting for the one real implementation.
export interface BetModeForNextSimulationRoundSetting {
    setBetModeForNextRound(session: GameSessionHandling): void;
}
