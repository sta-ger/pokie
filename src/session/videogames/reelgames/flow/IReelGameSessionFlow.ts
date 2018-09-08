import {IGameSessionFlow} from "../../../flow/IGameSessionFlow";
import {IReelGameSessionWinningLineModel} from "./IReelGameSessionWinningLineModel";
import {IReelGameSessionWinningScatterModel} from "./IReelGameSessionWinningScatterModel";

export interface IReelGameSessionFlow extends IGameSessionFlow {
    
    getReelsItems(): string[][];
    
    getWinningLines(): { [lineId: string]: IReelGameSessionWinningLineModel };
    
    getWinningScatters(): {};
    
}