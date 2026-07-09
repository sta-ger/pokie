import type {GameSessionHandling} from "../session/GameSessionHandling.js";

export interface BetForNextSimulationRoundSetting {
    setBetForNextRound(session: GameSessionHandling): void;
}
