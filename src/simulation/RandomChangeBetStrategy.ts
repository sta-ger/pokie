import type {BetForNextSimulationRoundSetting} from "./BetForNextSimulationRoundSetting.js";
import type {GameSessionHandling} from "../session/GameSessionHandling.js";

export class RandomChangeBetStrategy implements BetForNextSimulationRoundSetting {
    public setBetForNextRound(session: GameSessionHandling): void {
        const bets: number[] = session.getAvailableBets();
        const bet: number = bets[Math.floor(Math.random() * bets.length)];
        session.setBet(bet);
    }
}
