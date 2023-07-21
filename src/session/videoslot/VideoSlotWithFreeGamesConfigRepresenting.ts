import {
    VideoSlotConfigRepresenting,
    VideoSlotWithFreeGamesConfigDescribing,
    VideoSlotWithFreeGamesConfigSetting,
} from "pokie";

export interface VideoSlotWithFreeGamesConfigRepresenting
    extends VideoSlotConfigRepresenting,
        VideoSlotWithFreeGamesConfigDescribing,
        VideoSlotWithFreeGamesConfigSetting {}
