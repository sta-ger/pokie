import {
    GameWithFreeGamesSessionSerializing,
    VideoSlotSessionSerializing,
    VideoSlotWithFreeGamesInitialNetworkData,
    VideoSlotWithFreeGamesRoundNetworkData,
    VideoSlotWithFreeGamesSessionHandling,
} from "pokie";

export interface VideoSlotWithFreeGamesSessionSerializing<T extends string | number | symbol = string>
    extends VideoSlotSessionSerializing<T>,
        GameWithFreeGamesSessionSerializing {
    getInitialData(session: VideoSlotWithFreeGamesSessionHandling<T>): VideoSlotWithFreeGamesInitialNetworkData<T>;

    getRoundData(session: VideoSlotWithFreeGamesSessionHandling<T>): VideoSlotWithFreeGamesRoundNetworkData<T>;
}
