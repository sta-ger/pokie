import {GameSessionHandling} from "pokie";

export interface BetForNextSimulationRoundSetting {
    setBetForNextRound(session: GameSessionHandling): void;
}
