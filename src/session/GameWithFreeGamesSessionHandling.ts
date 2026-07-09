import type {FreeGamesStateDetermining} from "./FreeGamesStateDetermining.js";
import type {FreeGamesStateSetting} from "./FreeGamesStateSetting.js";
import type {GameSessionHandling} from "./GameSessionHandling.js";
import type {WonFreeGamesNumberDetermining} from "./WonFreeGamesNumberDetermining.js";

export interface GameWithFreeGamesSessionHandling
    extends GameSessionHandling,
        WonFreeGamesNumberDetermining,
        FreeGamesStateDetermining,
        FreeGamesStateSetting {}
