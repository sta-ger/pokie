import {IReelGameSession} from "./IReelGameSession";

export interface IReelGameWithFreeGamesSession extends IReelGameSession {
    
    getFreeGameNum(): number;
    
    getFreeGameSum(): number;
    
    getFreeGameBank(): number;
    
}