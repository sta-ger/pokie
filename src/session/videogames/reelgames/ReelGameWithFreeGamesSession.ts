import {ReelGameSession} from "./ReelGameSession";
import {IReelGameWithFreeGamesSession} from "./IReelGameWithFreeGamesSession";
import {IReelGameWithFreeGamesSessionModel} from "./IReelGameWithFreeGamesSessionModel";
import {IGameSessionModel} from "../../IGameSessionModel";
import {IGameSessionFlow} from "../../flow/IGameSessionFlow";
import {ReelGameWithFreeGamesSessionFlow} from "./flow/ReelGameWithFreeGamesSessionFlow";

export class ReelGameWithFreeGamesSession extends ReelGameSession implements IReelGameWithFreeGamesSession {
    
    public getFreeGameNum(): number {
        return (<IReelGameWithFreeGamesSessionModel>this._sessionModel).freeGamesNum;
    }
    
    public getFreeGameSum(): number {
        return (<IReelGameWithFreeGamesSessionModel>this._sessionModel).freeGamesSum;
    }
    
    public getFreeGameBank(): number {
        return (<IReelGameWithFreeGamesSessionModel>this._sessionModel).freeBank;
    }
    
    protected createFlow(): IGameSessionFlow {
        return new ReelGameWithFreeGamesSessionFlow();
    }
    
    protected createSessionModel(): IGameSessionModel {
        return {
            credits: 10000,
            bet: 1,
            winning: 0,
            freeGamesNum: 0,
            freeGamesSum: 0,
            freeBank: 0
        } as IReelGameWithFreeGamesSessionModel;
    }
}