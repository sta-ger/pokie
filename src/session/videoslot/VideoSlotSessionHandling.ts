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
    /** Validated upcoming model/generator geometry. An undefined return is authoritative ordinary
     * coordinates; callers must not replace it with a settled combination's tag.
     * Settled geometry remains owned by getScreenGeometry.
     */
    getConfiguredScreenGeometry?(): ScreenGeometry | undefined;
    /** Display dimensions captured with the current settled (or initial) screen. */
    getSettledScreenDimensions?(): {reels: number; rows: number};
    getVisibleSymbolsCombination?(): SymbolsCombinationDescribing<T>;
    getEvaluatedSymbolsCombination?(): SymbolsCombinationDescribing<T>;
    validateScreenCoordinates?(): void;

    getWinEvaluationResult(): WinEvaluationResult<T>;
}
