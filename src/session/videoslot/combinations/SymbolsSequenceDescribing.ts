import type {ConvertableToArray} from "../../ConvertableToArray.js";

export interface SymbolsSequenceDescribing<T extends string | number | symbol = string> extends ConvertableToArray<T> {
    getIndex(index: number): number;

    getSymbol(index: number): T;

    getSymbols(index: number, symbolsNumber: number): T[];

    getSize(): number;

    getNumberOfSymbols(symbolId: T): number;

    getSymbolWeight(symbolId: T): number;

    getSymbolsWeights(): Record<T, number>;

    getSymbolsIndexes(symbolsIds: T[]): number[];

    getSymbolsStacksIndexes(): {index: number; size: number}[];
}
