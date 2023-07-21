import {GameSessionConfigRepresenting} from "pokie";

export class GameSessionConfig implements GameSessionConfigRepresenting {
    private availableBets = [1, 2, 3, 4, 5, 10, 20, 30, 40, 50, 100];

    private creditsAmount = 1000;

    private bet: number;

    constructor() {
        this.bet = this.availableBets[0];
    }

    public setAvailableBets(availableBets: number[]): void {
        this.availableBets = [...availableBets];
    }

    public getAvailableBets(): number[] {
        return [...this.availableBets];
    }

    public setCreditsAmount(creditsAmount: number): void {
        this.creditsAmount = creditsAmount;
    }

    public getCreditsAmount(): number {
        return this.creditsAmount;
    }

    public setBet(bet: number): void {
        this.bet = bet;
    }

    public getBet(): number {
        return this.bet;
    }

    public isBetAvailable(bet: number): boolean {
        return this.getAvailableBets().includes(bet);
    }
}
