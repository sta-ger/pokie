import {IGameSessionConfig} from "../../IGameSessionConfig";

export interface IReelGameSessionConfig extends IGameSessionConfig {

    paytable: {
        [bet: number]: {
            [itemId: string]: {
                [times: number]: number
            }
        }
    };

    availableItems: string[];

    wildItemId: string;

    scatters: any[][];

    reelsNumber: number;

    reelsItemsNumber: number;

    reelsItemsSequences: string[][];

    linesDirections: {};

}
