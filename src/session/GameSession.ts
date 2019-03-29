import {IGameSession} from "./IGameSession";
import {IGameSessionFlow} from "./flow/IGameSessionFlow";
import {IGameSessionModel} from "./IGameSessionModel";
import {GameSessionParameters} from "./GameSessionParameters";

export class GameSession implements IGameSession {
    
    constructor(
        protected _flow: IGameSessionFlow,
        protected _sessionModel: IGameSessionModel
    ) {
        this._flow.create(this._sessionModel);
        this.initializeGlobalSessionParameters();
    }
    
    protected initializeGlobalSessionParameters(): void {
        GameSessionParameters.availableBets = [
            1,
            2,
            3,
            4,
            5,
            10,
            20,
            30,
            40,
            50,
            100
        ];
    }

    public getAcceptedBets(): number[] {
        return GameSessionParameters.availableBets;
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
        this._flow.play();
    }
    
    public canPlayNextGame(): boolean {
        return this._flow.canPlayNextGame();
    }

}
