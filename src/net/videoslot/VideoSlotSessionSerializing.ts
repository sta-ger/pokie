import type {GameSessionSerializing} from "../GameSessionSerializing.js";
import type {VideoSlotInitialNetworkData, VideoSlotRoundNetworkData} from "./VideoSlotNetworkData.js";
import type {VideoSlotSessionHandling} from "../../session/videoslot/VideoSlotSessionHandling.js";

export interface VideoSlotSessionSerializing<T extends string | number | symbol = string>
    extends GameSessionSerializing {
    getInitialData(session: VideoSlotSessionHandling<T>): VideoSlotInitialNetworkData<T>;

    getRoundData(session: VideoSlotSessionHandling<T>): VideoSlotRoundNetworkData<T>;
}
