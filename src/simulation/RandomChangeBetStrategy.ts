import {IChangeBetStrategy} from "./IChangeBetStrategy";
import {IGameSession} from "..";

export class RandomChangeBetStrategy implements IChangeBetStrategy {

    public setBetForPlay(session: IGameSession): void {
        const bets: number[] = session.getAvailableBets();
        const bet = bets[Math.floor(Math.random() * bets.length)];
        session.setBet(bet);
    }

}
