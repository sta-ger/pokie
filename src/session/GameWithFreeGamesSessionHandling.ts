import {
    FreeGamesStateDetermining,
    FreeGamesStateSetting,
    GameSessionHandling,
    WonFreeGamesNumberDetermining,
} from "pokie";

export interface GameWithFreeGamesSessionHandling
    extends GameSessionHandling,
        WonFreeGamesNumberDetermining,
        FreeGamesStateDetermining,
        FreeGamesStateSetting {}
