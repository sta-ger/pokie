import {WinAmountDetermining} from "pokie";

export interface WinningScatterDescribing extends WinAmountDetermining {
    getSymbolId(): string;
    getSymbolsPositions(): number[][];
}
