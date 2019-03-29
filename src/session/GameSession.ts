import {IGameSession} from "./IGameSession";
import {IGameSessionModel} from "./IGameSessionModel";
import {IGameSessionConfig} from "./IGameSessionConfig";
import {GameSessionConfig} from "./GameSessionConfig";

export class GameSession implements IGameSession {
    private _sessionModel: IGameSessionModel;
    private _config?: IGameSessionConfig;

    constructor(config?: IGameSessionConfig) {
        if (config) {
            this._config = config;
        } else {
            this._config = new GameSessionConfig();
        }
        this._sessionModel = {
            winning: 0,
            bet: this.isBetAvailable(this._config.bet) ? this._config.bet : this._config.availableBets[0],
            credits: this._config.creditsAmount
        };
    }

    public isBetAvailable(bet: number): boolean {
        return this._config.availableBets.indexOf(bet) >= 0;
    }

    public getAvailableBets(): number[] {
        return this._config.availableBets;
    }

    public getBet(): number {
        return this._sessionModel.bet;
    }

    public getWinningAmount(): number {
        return this._sessionModel.winning;
    }

    public getCreditsAmount(): number {
        return this._sessionModel.credits;
    }

    public setBet(bet: number): void {
        this._sessionModel.bet = bet;
    }

    public play(): void {
        if (this.canPlayNextGame()) {
            this._sessionModel.winning = 0;
            this._sessionModel.credits -= this._sessionModel.bet;
            this._sessionModel.credits += this._sessionModel.winning;
        }
    }

    public canPlayNextGame(): boolean {
        return this._sessionModel.credits >= this._sessionModel.bet;
    }

}
