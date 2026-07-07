import {
    GameSessionSerializing,
    VideoSlotInitialNetworkData,
    VideoSlotSessionHandling,
    VideoSlotRoundNetworkData,
} from "pokie";

export interface VideoSlotSessionSerializing<T extends string | number | symbol = string>
    extends GameSessionSerializing {
    getInitialData(session: VideoSlotSessionHandling<T>): VideoSlotInitialNetworkData<T>;

    getRoundData(session: VideoSlotSessionHandling<T>): VideoSlotRoundNetworkData<T>;
}
