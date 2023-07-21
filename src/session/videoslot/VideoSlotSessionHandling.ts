import {GameSessionHandling, VideoSlotConfigDescribing, VideoSlotRoundStateDetermining} from "pokie";

export interface VideoSlotSessionHandling
    extends VideoSlotConfigDescribing,
        GameSessionHandling,
        VideoSlotRoundStateDetermining {}
