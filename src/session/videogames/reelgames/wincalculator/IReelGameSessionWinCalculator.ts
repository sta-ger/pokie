import {IReelGameSessionWinningLineModel} from "./IReelGameSessionWinningLineModel";
import {IReelGameSessionWinningScatterModel} from "./IReelGameSessionWinningScatterModel";

export interface IReelGameSessionWinCalculator {

    setGameState(bet: number, items: string[][]): void;

    getWinningLines(): { [lineId: string]: IReelGameSessionWinningLineModel };

    getWinningScatters(): { [scatterItemId: string]: IReelGameSessionWinningScatterModel };

    getWinningAmount(): number;

    getLinesWinning(): number;

    getScattersWinning(): number;

}
