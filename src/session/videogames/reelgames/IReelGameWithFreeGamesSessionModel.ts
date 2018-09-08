import {IGameSessionModel} from "../../IGameSessionModel";

export interface IReelGameWithFreeGamesSessionModel extends IGameSessionModel {
    
    freeGamesNum: number;
    
    freeGamesSum: number;
    
    freeBank: number;
    
}