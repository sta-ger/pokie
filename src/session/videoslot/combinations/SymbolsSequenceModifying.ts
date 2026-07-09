import type {BuildableFromArray} from "../../BuildableFromArray.js";

export interface SymbolsSequenceModifying<T extends string | number | symbol = string> extends BuildableFromArray<T> {
    addSymbol(symbolId: T, stackSize?: number, index?: number): this;

    removeSymbol(index: number): this;

    removeAllSymbols(symbolId: T): this;

    addSymbols(symbolsIds: T[], index?: number): this;

    setSymbol(index: number, symbolId: T): this;

    setSymbols(index: number, symbols: T[]): this;

    shuffle(): this;

    fromSymbolsWeights(symbolsWeights: Record<T, number>): this;

    fromNumbersOfSymbols(symbolsNumbers: Record<T, number>): this;

    fromNumberOfEachSymbol(availableSymbols: T[], symbolsNumber: number): this;
}
