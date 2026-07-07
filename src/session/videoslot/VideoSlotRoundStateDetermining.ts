import {SymbolsCombinationDescribing, VideoSlotWinDetermining} from "pokie";

export interface VideoSlotRoundStateDetermining<T extends string | number | symbol = string>
    extends VideoSlotWinDetermining<T> {
    getSymbolsCombination(): SymbolsCombinationDescribing<T>;
}
