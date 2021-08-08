import {IGameSession} from "../../IGameSession";
import {IReelGameSessionWinningScatterModel} from "./wincalculator/IReelGameSessionWinningScatterModel";
import {IReelGameSessionWinningLineModel} from "./wincalculator/IReelGameSessionWinningLineModel";

export interface IReelGameSession extends IGameSession {

    getPaytable(): {
        [itemId: string]: {
            [times: number]: number,
        };
    };

    getReelsItems(): string[][];

    getWinningLines(): { [lineId: string]: IReelGameSessionWinningLineModel };

    getWinningScatters(): { [scatterId: string]: IReelGameSessionWinningScatterModel };

    getReelsItemsSequences(): string[][];

    getReelsItemsNumber(): number;

    getReelsNumber(): number;

}
