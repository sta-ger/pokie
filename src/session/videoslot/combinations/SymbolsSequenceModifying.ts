import {BuildableFromArray} from "pokie";

export interface SymbolsSequenceModifying extends BuildableFromArray {
    addSymbol(symbolId: string, stackSize?: number, index?: number): this;

    removeSymbol(index: number): this;

    removeAllSymbols(symbolId: string): this;

    addSymbols(symbolsIds: string[], index?: number): this;

    setSymbol(index: number, symbolId: string): this;

    setSymbols(index: number, symbols: string[]): this;

    shuffle(): this;

    fromSymbolsWeights(symbolsWeights: Record<string, number>): this;

    fromNumbersOfSymbols(symbolsNumbers: Record<string, number>): this;

    fromNumberOfEachSymbol(availableSymbols: string[], symbolsNumber: number): this;
}
