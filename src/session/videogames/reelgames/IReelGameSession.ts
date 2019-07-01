import {IGameSession} from "../../IGameSession";
import {IReelGameSessionWinningScatterModel} from "./wincalculator/IReelGameSessionWinningScatterModel";

export interface IReelGameSession extends IGameSession {

    getPaytable(): {
        [itemId: string]: {
            [times: number]: number,
        };
    };

    getReelsItems(): string[][];

    getWinningLines(): {};

    getWinningScatters(): { [scatterId: string]: IReelGameSessionWinningScatterModel };

    getReelsItemsSequences(): string[][];

    getReelsItemsNumber(): number;

    getReelsNumber(): number;

}
