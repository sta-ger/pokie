import type {SymbolsCombinationDescribing} from "./combinations/SymbolsCombinationDescribing.js";
import type {VideoSlotWinDetermining} from "./VideoSlotWinDetermining.js";

export interface VideoSlotRoundStateDetermining<T extends string | number | symbol = string>
    extends VideoSlotWinDetermining<T> {
    getSymbolsCombination(): SymbolsCombinationDescribing<T>;
}
