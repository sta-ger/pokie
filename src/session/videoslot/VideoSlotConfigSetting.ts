import {
    LinesDefinitionsDescribing,
    LinesPatternsDescribing,
    PaytableRepresenting,
    SymbolsSequenceDescribing,
} from "pokie";

export interface VideoSlotConfigSetting {
    setPaytable(paytable: PaytableRepresenting): void;

    setAvailableSymbols(availableSymbols: string[]): void;

    setReelsNumber(reelsNumber: number): void;

    setReelsSymbolsNumber(reelsSymbolsNumber: number): void;

    setSymbolsSequences(symbolsSequences: SymbolsSequenceDescribing[]): void;

    setWildSymbols(value: string[]): void;

    setScatterSymbols(value: string[]): void;

    setLinesDefinitions(linesDefinitions: LinesDefinitionsDescribing): void;

    setLinesPatterns(linesPatterns: LinesPatternsDescribing): void;
}
