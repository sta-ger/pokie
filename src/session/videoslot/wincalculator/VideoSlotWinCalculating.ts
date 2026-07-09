import type {SymbolsCombinationDescribing} from "../combinations/SymbolsCombinationDescribing.js";
import {ValidationResult} from "../../../validation/ValidationResult.js";
import type {VideoSlotWinDetermining} from "../VideoSlotWinDetermining.js";

export interface VideoSlotWinCalculating<T extends string | number | symbol = string>
    extends VideoSlotWinDetermining<T> {
    calculateWin(bet: number, symbolsCombination: SymbolsCombinationDescribing<T>): void;

    validateWinEvaluation?(bet: number, symbolsCombination: SymbolsCombinationDescribing<T>): ValidationResult;
}
