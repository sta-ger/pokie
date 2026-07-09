import type {GameSessionHandling} from "../session/GameSessionHandling.js";
import type {GameInitialNetworkData, GameRoundNetworkData} from "./GameNetworkData.js";

export interface GameSessionSerializing {
    getInitialData(session: GameSessionHandling): GameInitialNetworkData;

    getRoundData(session: GameSessionHandling): GameRoundNetworkData;
}
