import {GameSessionConfigRepresenting, VideoSlotConfigDescribing, VideoSlotConfigSetting} from "pokie";

export interface VideoSlotConfigRepresenting
    extends GameSessionConfigRepresenting,
        VideoSlotConfigDescribing,
        VideoSlotConfigSetting {}
