import {
    GameWithFreeGamesInitialNetworkData,
    GameWithFreeGamesRoundNetworkData,
    GameWithFreeGamesSessionHandling,
} from "pokie";

export interface GameWithFreeGamesSessionSerializing {
    getInitialData(session: GameWithFreeGamesSessionHandling): GameWithFreeGamesInitialNetworkData;

    getRoundData(session: GameWithFreeGamesSessionHandling): GameWithFreeGamesRoundNetworkData;
}
