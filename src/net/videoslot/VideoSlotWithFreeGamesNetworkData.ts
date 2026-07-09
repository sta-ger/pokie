import type {
    GameWithFreeGamesInitialNetworkData,
    GameWithFreeGamesRoundNetworkData,
} from "../GameWithFreeGamesNetworkData.js";
import type {VideoSlotInitialNetworkData, VideoSlotRoundNetworkData} from "./VideoSlotNetworkData.js";

export type VideoSlotWithFreeGamesInitialNetworkData<T extends string | number | symbol = string> = {
    /** empty **/
} & VideoSlotInitialNetworkData<T> &
    GameWithFreeGamesInitialNetworkData &
    VideoSlotWithFreeGamesRoundNetworkData<T>;

export type VideoSlotWithFreeGamesRoundNetworkData<T extends string | number | symbol = string> = {
    /** empty **/
} & VideoSlotRoundNetworkData<T> &
    GameWithFreeGamesRoundNetworkData;
