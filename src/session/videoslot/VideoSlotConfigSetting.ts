import type {LinesDefinitionsDescribing} from "./linesdefinitions/LinesDefinitionsDescribing.js";
import type {LinesPatternsDescribing} from "./linespatterns/LinesPatternsDescribing.js";
import type {PaytableRepresenting} from "./paytable/PaytableRepresenting.js";
import type {SymbolsSequenceDescribing} from "./combinations/SymbolsSequenceDescribing.js";

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
