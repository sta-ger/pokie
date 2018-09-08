import {IGameSession} from "./IGameSession";
import {IGameSessionFlow} from "./flow/IGameSessionFlow";
import {IGameSessionModel} from "./IGameSessionModel";
import {GameSessionFlow} from "./flow/GameSessionFlow";
import {GameSessionParameters} from "./GameSessionParameters";

export class GameSession implements IGameSession {
    protected _flow: IGameSessionFlow;
    protected _sessionModel: IGameSessionModel;
    
    constructor() {
        this.initializeGlobalSessionParameters();
        this.initialize();
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
    
    protected initialize(): void {
        this.initializeSessionModel();
        this.initializeFlow();
    }
    
    protected initializeFlow(): void {
        this._flow = this.createFlow();
        this._flow.create(this._sessionModel);
    }
    
    protected initializeSessionModel(): void {
        this._sessionModel = this.createSessionModel();
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
    
    protected createFlow(): IGameSessionFlow {
        return new GameSessionFlow();
    }
    
    protected createSessionModel(): IGameSessionModel {
        return {
            credits: 10000,
            bet: 1,
            winning: 0
        };
    }
    
}
