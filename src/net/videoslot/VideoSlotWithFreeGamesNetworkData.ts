import {
    GameWithFreeGamesInitialNetworkData,
    GameWithFreeGamesRoundNetworkData,
    VideoSlotInitialNetworkData,
    VideoSlotRoundNetworkData,
} from "pokie";

export type VideoSlotWithFreeGamesInitialNetworkData<T extends string | number | symbol = string> = {
    /** empty **/
} & VideoSlotInitialNetworkData<T> &
    GameWithFreeGamesInitialNetworkData &
    VideoSlotWithFreeGamesRoundNetworkData<T>;

export type VideoSlotWithFreeGamesRoundNetworkData<T extends string | number | symbol = string> = {
    /** empty **/
} & VideoSlotRoundNetworkData<T> &
    GameWithFreeGamesRoundNetworkData;
