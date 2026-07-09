import type {SymbolsSequenceDescribing} from "./SymbolsSequenceDescribing.js";

export interface ReelsSymbolsSequencesGenerating<T extends string | number | symbol = string> {
    generate(
        reelsNumber: number,
        availableSymbols: T[],
        wildSymbols: T[],
        scatterSymbols: T[],
    ): SymbolsSequenceDescribing<T>[];
}
