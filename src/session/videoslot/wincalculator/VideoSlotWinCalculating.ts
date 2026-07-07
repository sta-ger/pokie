import {SymbolsCombinationDescribing, VideoSlotWinDetermining} from "pokie";

export interface VideoSlotWinCalculating<T extends string | number | symbol = string>
    extends VideoSlotWinDetermining<T> {
    calculateWin(bet: number, symbolsCombination: SymbolsCombinationDescribing<T>): void;
}
