import type {FreeGamesRoundHandling} from "./FreeGamesRoundHandling.js";
import type {VideoSlotWithFreeGamesSessionHandling} from "./VideoSlotWithFreeGamesSessionHandling.js";

export class FreeGamesRoundHandler<T extends string | number | symbol = string> implements FreeGamesRoundHandling<T> {
    public beforeRoundPlayed(session: VideoSlotWithFreeGamesSessionHandling<T>): void {
        if (session.getFreeGamesNum() === session.getFreeGamesSum()) {
            session.setFreeGamesBank(0);
            session.setFreeGamesNum(0);
            session.setFreeGamesSum(0);
        }
    }

    public afterRoundPlayed(session: VideoSlotWithFreeGamesSessionHandling<T>, creditsBeforePlay: number): void {
        let cursor = session.getFreeGamesNum();
        let bank = session.getFreeGamesBank();
        let credits = session.getCreditsAmount();
        let sum = session.getFreeGamesSum();
        if (sum > 0 && cursor < sum) {
            cursor++;
            bank += session.getWinAmount();
            credits = creditsBeforePlay;
        }
        const wonFreeGames = session.getWonFreeGamesNumber();
        if (wonFreeGames > 0) sum += wonFreeGames;
        else if (sum > 0 && cursor === sum) credits += bank;
        if (!Number.isFinite(bank) || !Number.isFinite(credits)) throw new Error("Free-games bank or balance overflow.");
        session.setFreeGamesNum(cursor);
        session.setFreeGamesBank(bank);
        session.setFreeGamesSum(sum);
        session.setCreditsAmount(credits);
    }
}
