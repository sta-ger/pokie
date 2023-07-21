import {
    GameWithFreeGamesInitialNetworkData,
    GameWithFreeGamesRoundNetworkData,
    VideoSlotInitialNetworkData,
    VideoSlotRoundNetworkData,
} from "pokie";

export type VideoSlotWithFreeGamesInitialNetworkData = {
    /** empty **/
} & VideoSlotInitialNetworkData &
    GameWithFreeGamesInitialNetworkData &
    VideoSlotWithFreeGamesRoundNetworkData;

export type VideoSlotWithFreeGamesRoundNetworkData = {
    /** empty **/
} & VideoSlotRoundNetworkData &
    GameWithFreeGamesRoundNetworkData;
