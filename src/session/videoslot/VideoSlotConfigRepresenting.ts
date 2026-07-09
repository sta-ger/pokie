import type {GameSessionConfigRepresenting} from "../GameSessionConfigRepresenting.js";
import type {VideoSlotConfigDescribing} from "./VideoSlotConfigDescribing.js";
import type {VideoSlotConfigSetting} from "./VideoSlotConfigSetting.js";

export interface VideoSlotConfigRepresenting<T extends string | number | symbol = string>
    extends GameSessionConfigRepresenting,
        VideoSlotConfigDescribing<T>,
        VideoSlotConfigSetting<T> {}
