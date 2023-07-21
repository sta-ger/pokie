import {GameWithFreeGamesSessionHandling, GameInitialNetworkData, GameRoundNetworkData} from "pokie";

export interface GameWithFreeGamesSessionSerializing {
    getInitialData(session: GameWithFreeGamesSessionHandling): GameInitialNetworkData;

    getRoundData(session: GameWithFreeGamesSessionHandling): GameRoundNetworkData;
}
