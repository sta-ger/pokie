import {GameSessionHandling} from "pokie";

export class GameSessionReturnSpecifiedWinMock implements GameSessionHandling {
    private readonly winModel: {value: number};

    constructor(winAmountModel: {value: number}) {
        this.winModel = winAmountModel;
    }

    public getCreditsAmount(): number {
        return 0;
    }

    public setCreditsAmount(): void {
        /* no-op */
    }

    public getWinAmount(): number {
        return this.winModel.value;
    }

    public getAvailableBets(): number[] {
        return [];
    }

    public isBetAvailable(): boolean {
        return false;
    }

    public getBet(): number {
        return 0;
    }

    public setBet(): void {
        /* no-op */
    }

    public canPlayNextGame(): boolean {
        return false;
    }

    public play(): void {
        /* no-op */
    }
}
