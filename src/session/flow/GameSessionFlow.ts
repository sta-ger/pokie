import {IGameSessionFlow} from "./IGameSessionFlow";
import {IGameSessionModel} from "../IGameSessionModel";

export class GameSessionFlow implements IGameSessionFlow {
    protected _sessionModel: IGameSessionModel;
    
    constructor() {
        this.initialize();
    }
    
    protected initialize(): void {
    }
    
    public create(model: IGameSessionModel): void {
        this._sessionModel = model;
    }
    
    public play(): void {
        if (this.canPlayNextGame()) {
            this.proceedPlay();
        }
    }
    
    protected proceedPlay(): void {
        this.updateCreditsBeforePlay();
        this.resetLastWinningBeforePlay();
        this.doPlayStuff();
        this.calculateWinning();
        this.updateCreditsAfterPlay();
    }
    
    protected doPlayStuff(): void {
    
    }
    
    protected calculateWinning(): void {
    
    }
    
    public canPlayNextGame(): boolean {
        let rv: boolean;
        if (this._sessionModel.credits >= this._sessionModel.bet) {
            rv = true;
        }
        return rv;
    }
    
    protected resetLastWinningBeforePlay(): void {
        this._sessionModel.winning = 0;
    }
    
    protected updateCreditsBeforePlay(): void {
        this._sessionModel.credits -= this._sessionModel.bet;
    }
    
    protected updateCreditsAfterPlay(): void {
        this._sessionModel.credits += this._sessionModel.winning;
    }
    
    protected dispatchCantPlayNextGameEvent(): void {
    
    }

}
