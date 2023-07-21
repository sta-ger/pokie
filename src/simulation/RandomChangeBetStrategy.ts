import {BetForNextSimulationRoundSetting, GameSessionHandling} from "pokie";

export class RandomChangeBetStrategy implements BetForNextSimulationRoundSetting {
    public setBetForNextRound(session: GameSessionHandling): void {
        const bets: number[] = session.getAvailableBets();
        const bet: number = bets[Math.floor(Math.random() * bets.length)];
        session.setBet(bet);
    }
}
