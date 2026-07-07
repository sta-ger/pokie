import {WinAmountDetermining} from "pokie";

export interface WinningLineDescribing<T extends string | number | symbol = string> extends WinAmountDetermining {
    getDefinition(): number[];

    getPattern(): number[];

    getSymbolId(): T;

    getLineId(): string;

    getSymbolsPositions(): number[];

    getWildSymbolsPositions(): number[];
}
