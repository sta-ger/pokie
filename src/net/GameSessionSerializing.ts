import {GameSessionHandling, GameInitialNetworkData, GameRoundNetworkData} from "pokie";

export interface GameSessionSerializing {
    getInitialData(session: GameSessionHandling): GameInitialNetworkData;

    getRoundData(session: GameSessionHandling): GameRoundNetworkData;
}
