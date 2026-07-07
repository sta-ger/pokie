import {WinAmountDetermining} from "pokie";

export interface WinningScatterDescribing<T extends string | number | symbol = string> extends WinAmountDetermining {
    getSymbolId(): T;
    getSymbolsPositions(): number[][];
}
