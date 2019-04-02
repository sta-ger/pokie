import {IGameSession} from "./IGameSession";
import {IGameSessionConfig} from "./IGameSessionConfig";
import {GameSessionConfig} from "./GameSessionConfig";

export class GameSession implements IGameSession {
    private readonly _config?: IGameSessionConfig;
    private _bet: number;
    private _credits: number;

    constructor(config?: IGameSessionConfig) {
        if (config) {
            this._config = config;
        } else {
            this._config = new GameSessionConfig();
        }
        this._bet = this.isBetAvailable(this._config.bet) ? this._config.bet : this._config.availableBets[0];
        this._credits = this._config.creditsAmount;
    }

    public isBetAvailable(bet: number): boolean {
        return this._config.availableBets.indexOf(bet) >= 0;
    }

    public getAvailableBets(): number[] {
        return this._config.availableBets;
    }

    public getBet(): number {
        return this._bet;
    }

    public getCreditsAmount(): number {
        return this._credits;
    }

    public setBet(bet: number): void {
        this._bet = bet;
    }

    public play(): void {
        if (this.canPlayNextGame()) {
            this._credits -= this._bet;
        }
    }

    public canPlayNextGame(): boolean {
        return this._credits >= this._bet;
    }

}
