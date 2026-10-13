import type {ScreenGeometry} from "./coordinates/ScreenGeometry.js";
import type {SymbolsCombinationDescribing} from "./combinations/SymbolsCombinationDescribing.js";
import type {GameSessionHandling} from "../GameSessionHandling.js";
import type {VideoSlotConfigDescribing} from "./VideoSlotConfigDescribing.js";
import type {VideoSlotRoundStateDetermining} from "./VideoSlotRoundStateDetermining.js";
import {WinEvaluationResult} from "./winevaluation/WinEvaluationResult.js";

export interface VideoSlotSessionHandling<T extends string | number | symbol = string>
    extends VideoSlotConfigDescribing<T>,
        GameSessionHandling,
        VideoSlotRoundStateDetermining<T> {
    getScreenGeometry?(): ScreenGeometry | undefined;
    getVisibleSymbolsCombination?(): SymbolsCombinationDescribing<T>;
    getEvaluatedSymbolsCombination?(): SymbolsCombinationDescribing<T>;
    validateScreenCoordinates?(): void;

    getWinEvaluationResult(): WinEvaluationResult<T>;
}
