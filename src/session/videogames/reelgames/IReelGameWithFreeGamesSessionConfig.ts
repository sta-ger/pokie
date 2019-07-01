import {IReelGameSessionConfig} from "./IReelGameSessionConfig";

export interface IReelGameWithFreeGamesSessionConfig extends IReelGameSessionConfig {

    freeGamesForScatters: {
        [scatterId: string]: {
            [times: number]: number,
        };
    };

}
