import {
    GameWithFreeGamesSessionSerializing,
    VideoSlotSessionSerializing,
    VideoSlotWithFreeGamesInitialNetworkData,
    VideoSlotWithFreeGamesRoundNetworkData,
    VideoSlotWithFreeGamesSessionHandling,
} from "pokie";

export interface VideoSlotWithFreeGamesSessionSerializing
    extends VideoSlotSessionSerializing,
        GameWithFreeGamesSessionSerializing {
    getInitialData(session: VideoSlotWithFreeGamesSessionHandling): VideoSlotWithFreeGamesInitialNetworkData;

    getRoundData(session: VideoSlotWithFreeGamesSessionHandling): VideoSlotWithFreeGamesRoundNetworkData;
}
