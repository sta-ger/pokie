import {
    LinesDefinitionsDescribing,
    LinesPatternsDescribing,
    PaytableRepresenting,
    SymbolsSequenceDescribing,
} from "pokie";

export interface VideoSlotConfigSetting<T extends string | number | symbol = string> {
    setPaytable(paytable: PaytableRepresenting<T>): void;

    setAvailableSymbols(availableSymbols: T[]): void;

    setReelsNumber(reelsNumber: number): void;

    setReelsSymbolsNumber(reelsSymbolsNumber: number): void;

    setSymbolsSequences(symbolsSequences: SymbolsSequenceDescribing<T>[]): void;

    setWildSymbols(value: T[]): void;

    setScatterSymbols(value: T[]): void;

    setLinesDefinitions(linesDefinitions: LinesDefinitionsDescribing): void;

    setLinesPatterns(linesPatterns: LinesPatternsDescribing): void;

    // Optional so existing implementers of this interface keep compiling unchanged.
    setWildSubstitutions?(value: Partial<Record<T, T[]>>): void;
}
