import {WinAmountDetermining} from "pokie";

export interface WinningLineDescribing extends WinAmountDetermining {
    getDefinition(): number[];

    getPattern(): number[];

    getSymbolId(): string;

    getLineId(): string;

    getSymbolsPositions(): number[];

    getWildSymbolsPositions(): number[];
}
