import {GameSessionHandling, VideoSlotConfigDescribing, VideoSlotRoundStateDetermining, WinEvaluationResult} from "pokie";

export interface VideoSlotSessionHandling<T extends string | number | symbol = string>
    extends VideoSlotConfigDescribing<T>,
        GameSessionHandling,
        VideoSlotRoundStateDetermining<T> {
    getWinEvaluationResult(): WinEvaluationResult<T>;
}
