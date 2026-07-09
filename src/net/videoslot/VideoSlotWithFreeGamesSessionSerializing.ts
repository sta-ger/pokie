import type {GameWithFreeGamesSessionSerializing} from "../GameWithFreeGamesSessionSerializing.js";
import type {VideoSlotSessionSerializing} from "./VideoSlotSessionSerializing.js";
import type {
    VideoSlotWithFreeGamesInitialNetworkData,
    VideoSlotWithFreeGamesRoundNetworkData,
} from "./VideoSlotWithFreeGamesNetworkData.js";
import type {VideoSlotWithFreeGamesSessionHandling} from "../../session/videoslot/VideoSlotWithFreeGamesSessionHandling.js";

export interface VideoSlotWithFreeGamesSessionSerializing<T extends string | number | symbol = string>
    extends VideoSlotSessionSerializing<T>,
        GameWithFreeGamesSessionSerializing {
    getInitialData(session: VideoSlotWithFreeGamesSessionHandling<T>): VideoSlotWithFreeGamesInitialNetworkData<T>;

    getRoundData(session: VideoSlotWithFreeGamesSessionHandling<T>): VideoSlotWithFreeGamesRoundNetworkData<T>;
}
