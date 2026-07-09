import type {WinAmountDetermining} from "../WinAmountDetermining.js";

export interface WinningScatterDescribing<T extends string | number | symbol = string> extends WinAmountDetermining {
    getSymbolId(): T;
    getSymbolsPositions(): number[][];
}
