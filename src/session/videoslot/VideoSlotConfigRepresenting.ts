import {GameSessionConfigRepresenting, VideoSlotConfigDescribing, VideoSlotConfigSetting} from "pokie";

export interface VideoSlotConfigRepresenting<T extends string | number | symbol = string>
    extends GameSessionConfigRepresenting,
        VideoSlotConfigDescribing<T>,
        VideoSlotConfigSetting<T> {}
