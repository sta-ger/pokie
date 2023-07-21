import {
    GameSessionConfig,
    GameSessionConfigRepresenting,
    GameSessionHandling,
    NoWinAmount,
    WinAmountDetermining,
} from "pokie";

export class GameSession implements GameSessionHandling {
    private readonly config: GameSessionConfigRepresenting;
    private readonly winCalculator: WinAmountDetermining;
    private bet: number;
    private credits: number;

    constructor(
        config: GameSessionConfigRepresenting = new GameSessionConfig(),
        winAmountCalculator: WinAmountDetermining = new NoWinAmount(),
    ) {
        this.config = config;
        this.winCalculator = winAmountCalculator;
        this.bet = this.getInitialBet();
        this.credits = config.getCreditsAmount();
    }

    public getCreditsAmount(): number {
        return this.credits;
    }

    public setCreditsAmount(creditsAmount: number): void {
        this.credits = creditsAmount;
    }

    public getWinAmount(): number {
        return this.winCalculator.getWinAmount();
    }

    public getAvailableBets(): number[] {
        return this.config.getAvailableBets();
    }

    public getBet(): number {
        return this.bet;
    }

    public setBet(bet: number): void {
        if (!this.config.isBetAvailable(bet)) {
            this.bet = this.getAvailableBets()[0];
        } else {
            this.bet = bet;
        }
    }

    public canPlayNextGame(): boolean {
        return this.credits >= this.bet;
    }

    public play(): void {
        if (this.canPlayNextGame()) {
            this.credits -= this.bet;
        }
    }

    private getInitialBet(): number {
        let initialBet: number;
        if (this.config.isBetAvailable(this.config.getBet())) {
            initialBet = this.config.getBet();
        } else {
            initialBet = this.config.getAvailableBets()[0];
        }
        return initialBet;
    }
}
