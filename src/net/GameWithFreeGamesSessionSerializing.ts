import type {
    GameWithFreeGamesInitialNetworkData,
    GameWithFreeGamesRoundNetworkData,
} from "./GameWithFreeGamesNetworkData.js";
import type {GameWithFreeGamesSessionHandling} from "../session/GameWithFreeGamesSessionHandling.js";

export interface GameWithFreeGamesSessionSerializing {
    getInitialData(session: GameWithFreeGamesSessionHandling): GameWithFreeGamesInitialNetworkData;

    getRoundData(session: GameWithFreeGamesSessionHandling): GameWithFreeGamesRoundNetworkData;
}
