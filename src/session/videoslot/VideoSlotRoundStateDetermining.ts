import {SymbolsCombinationDescribing, VideoSlotWinDetermining} from "pokie";

export interface VideoSlotRoundStateDetermining extends VideoSlotWinDetermining {
    getSymbolsCombination(): SymbolsCombinationDescribing;
}
