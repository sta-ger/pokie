import {SymbolsCombinationDescribing, VideoSlotWinDetermining} from "pokie";

export interface VideoSlotWinCalculating extends VideoSlotWinDetermining {
    calculateWin(bet: number, symbolsCombination: SymbolsCombinationDescribing): void;
}
