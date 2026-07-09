import type {WinAmountDetermining} from "../WinAmountDetermining.js";

export interface WinningWayDescribing<T extends string | number | symbol = string> extends WinAmountDetermining {
    getSymbolId(): T;

    getSymbolsPositions(): number[][];

    getWaysCount(): number;
}
