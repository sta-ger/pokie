import type {GameInitialNetworkData, GameRoundNetworkData} from "./GameNetworkData.js";

export type GameWithFreeGamesInitialNetworkData = {
    /** empty **/
} & GameInitialNetworkData &
    GameWithFreeGamesRoundNetworkData;

export type GameWithFreeGamesRoundNetworkData = {
    freeGamesNum?: number;
    freeGamesSum?: number;
    freeGamesBank?: number;
    wonFreeGamesNumber?: number;
} & GameRoundNetworkData;
