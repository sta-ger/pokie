import type {GameSessionHandling} from "../GameSessionHandling.js";
import type {VideoSlotConfigDescribing} from "./VideoSlotConfigDescribing.js";
import type {VideoSlotRoundStateDetermining} from "./VideoSlotRoundStateDetermining.js";
import {WinEvaluationResult} from "./winevaluation/WinEvaluationResult.js";

export interface VideoSlotSessionHandling<T extends string | number | symbol = string>
    extends VideoSlotConfigDescribing<T>,
        GameSessionHandling,
        VideoSlotRoundStateDetermining<T> {
    getWinEvaluationResult(): WinEvaluationResult<T>;
}
