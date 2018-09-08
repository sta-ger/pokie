import {IGameSessionModel} from "../../../../IGameSessionModel";
import {IReelGameSessionWinningLineModel} from "../IReelGameSessionWinningLineModel";
import {IReelGameSessionWinningScatterModel} from "../IReelGameSessionWinningScatterModel";

export interface IReelGameSessionWinCalculator {
    
    setModel(model: IGameSessionModel): void;
    
    setReelsItems(items: string[][]): void;
    
    getWinningLines(): { [lineId: string]: IReelGameSessionWinningLineModel };
    
    getWinningScatters(): {};
    
    flipMatrix(source: any[][]): any[][]
    
}
