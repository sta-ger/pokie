import {WinAmountDetermining} from "pokie";

export interface WinningValueDescribing<T extends string | number | symbol = string> extends WinAmountDetermining {
    getSymbolId(): T;

    getSymbolsPositions(): number[][];
}
