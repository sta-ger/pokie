import {
    AvailableBetsDescribing,
    LinesDefinitionsDescribing,
    LinesPatternsDescribing,
    PaytableRepresenting,
    SymbolsSequenceDescribing,
} from "pokie";

export interface VideoSlotConfigDescribing<T extends string | number | symbol = string>
    extends AvailableBetsDescribing {
    getPaytable(): PaytableRepresenting<T>;

    getAvailableSymbols(): T[];

    getReelsNumber(): number;

    getReelsSymbolsNumber(): number;

    isSymbolScatter(symbolId: T): boolean;

    isSymbolWild(symbolId: T): boolean;

    getSymbolsSequences(): SymbolsSequenceDescribing<T>[];

    getWildSymbols(): T[];

    getScatterSymbols(): T[];

    getLinesDefinitions(): LinesDefinitionsDescribing;

    getLinesPatterns(): LinesPatternsDescribing;
}
