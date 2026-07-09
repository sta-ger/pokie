import type {VideoSlotConfigRepresenting} from "./VideoSlotConfigRepresenting.js";
import type {VideoSlotWithFreeGamesConfigDescribing} from "./VideoSlotWithFreeGamesConfigDescribing.js";
import type {VideoSlotWithFreeGamesConfigSetting} from "./VideoSlotWithFreeGamesConfigSetting.js";

export interface VideoSlotWithFreeGamesConfigRepresenting<T extends string | number | symbol = string>
    extends VideoSlotConfigRepresenting<T>,
        VideoSlotWithFreeGamesConfigDescribing<T>,
        VideoSlotWithFreeGamesConfigSetting<T> {}
