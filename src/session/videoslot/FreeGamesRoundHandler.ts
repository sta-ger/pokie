import {FreeGamesRoundHandling, VideoSlotWithFreeGamesSessionHandling} from "pokie";

export class FreeGamesRoundHandler<T extends string | number | symbol = string>
implements FreeGamesRoundHandling<T> {
    public beforeRoundPlayed(session: VideoSlotWithFreeGamesSessionHandling<T>): void {
        if (session.getFreeGamesNum() === session.getFreeGamesSum()) {
            session.setFreeGamesBank(0);
            session.setFreeGamesNum(0);
            session.setFreeGamesSum(0);
        }
    }

    public afterRoundPlayed(session: VideoSlotWithFreeGamesSessionHandling<T>, creditsBeforePlay: number): void {
        if (session.getFreeGamesSum() > 0 && session.getFreeGamesNum() < session.getFreeGamesSum()) {
            session.setFreeGamesNum(session.getFreeGamesNum() + 1);
            session.setFreeGamesBank(session.getFreeGamesBank() + session.getWinAmount());
            session.setCreditsAmount(creditsBeforePlay);
        }
        const wonFreeGames = session.getWonFreeGamesNumber();
        if (wonFreeGames > 0) {
            session.setFreeGamesSum(session.getFreeGamesSum() + wonFreeGames);
        } else if (session.getFreeGamesSum() > 0 && session.getFreeGamesNum() === session.getFreeGamesSum()) {
            session.setCreditsAmount(session.getCreditsAmount() + session.getFreeGamesBank());
        }
    }
}
