import {WinAmountDetermining} from "pokie";

export interface WinningClusterDescribing<T extends string | number | symbol = string> extends WinAmountDetermining {
    getSymbolId(): T;

    getSymbolsPositions(): number[][];
}
