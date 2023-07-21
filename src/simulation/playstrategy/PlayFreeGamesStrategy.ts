import {NextSessionRoundPlayableDetermining, VideoSlotWithFreeGamesSessionHandling} from "pokie";

export class PlayFreeGamesStrategy implements NextSessionRoundPlayableDetermining {
    private exactNumberOfFreeGames?: number;
    private lastFreeGame = false;
    private shouldHaveFreeBankAtEnd = true;

    public canPlayNextSimulationRound(session: VideoSlotWithFreeGamesSessionHandling): boolean {
        if (this.lastFreeGame) {
            let r = !(session.getFreeGamesNum() === session.getFreeGamesSum() && !!session.getFreeGamesSum());
            if (this.shouldHaveFreeBankAtEnd && session.getFreeGamesBank() === 0) {
                r = true;
            }
            if (!this.shouldHaveFreeBankAtEnd && session.getFreeGamesBank() > 0) {
                r = true;
            }
            return r;
        } else {
            if (this.exactNumberOfFreeGames) {
                return !(session.getWonFreeGamesNumber() === this.exactNumberOfFreeGames);
            } else {
                return !(session.getWonFreeGamesNumber() > 0);
            }
        }
    }

    public getExactNumberOfFreeGames(): number | undefined {
        return this.exactNumberOfFreeGames;
    }

    public setExactNumberOfFreeGames(value: number | undefined) {
        this.exactNumberOfFreeGames = value;
    }

    public getLastFreeGame(): boolean {
        return this.lastFreeGame;
    }

    public setLastFreeGame(value: boolean) {
        this.lastFreeGame = value;
    }

    public getShouldHaveFreeBankAtEnd(): boolean {
        return this.shouldHaveFreeBankAtEnd;
    }

    public setShouldHaveFreeBankAtEnd(value: boolean) {
        this.shouldHaveFreeBankAtEnd = value;
    }
}
