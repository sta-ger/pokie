import {
    VideoSlotConfigRepresenting,
    VideoSlotWithFreeGamesConfigDescribing,
    VideoSlotWithFreeGamesConfigSetting,
} from "pokie";

export interface VideoSlotWithFreeGamesConfigRepresenting<T extends string | number | symbol = string>
    extends VideoSlotConfigRepresenting<T>,
        VideoSlotWithFreeGamesConfigDescribing<T>,
        VideoSlotWithFreeGamesConfigSetting<T> {}
