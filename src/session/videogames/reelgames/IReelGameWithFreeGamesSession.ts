import {IReelGameSession} from "./IReelGameSession";

export interface IReelGameWithFreeGamesSession extends IReelGameSession {

    getWonFreeGamesNumber(): number;

    getFreeGameNum(): number;

    getFreeGameSum(): number;
    
    getFreeGameBank(): number;
    
}