import {ConvertableToArray} from "pokie";

export interface SymbolsSequenceDescribing extends ConvertableToArray {
    getIndex(index: number): number;

    getSymbol(index: number): string;

    getSymbols(index: number, symbolsNumber: number): string[];

    getSize(): number;

    getNumberOfSymbols(symbolId: string): number;

    getSymbolWeight(symbolId: string): number;

    getSymbolsWeights(): Record<string, number>;

    getSymbolsIndexes(symbolsIds: string[]): number[];

    getSymbolsStacksIndexes(): {index: number; size: number}[];
}
