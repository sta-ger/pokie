import {IReelGameWithFreeGamesSessionConfig} from "./IReelGameWithFreeGamesSessionConfig";
import {ReelGameSessionConfig} from "./ReelGameSessionConfig";

export class ReelGameWithFreeGamesSessionConfig extends ReelGameSessionConfig implements IReelGameWithFreeGamesSessionConfig {
    private _freeGamesForScatters: { [p: string]: { [p: number]: number } };

    constructor() {
        super();
        this._freeGamesForScatters = {
            "s": {
                3: 10
            }
        };
    }

    public get freeGamesForScatters(): { [p: string]: { [p: number]: number } } {
        return this._freeGamesForScatters;
    }

    public set freeGamesForScatters(value: { [p: string]: { [p: number]: number } }) {
        this._freeGamesForScatters = value;
    }

}