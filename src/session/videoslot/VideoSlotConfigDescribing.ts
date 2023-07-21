import {
    AvailableBetsDescribing,
    LinesDefinitionsDescribing,
    LinesPatternsDescribing,
    PaytableRepresenting,
    SymbolsSequenceDescribing,
} from "pokie";

export interface VideoSlotConfigDescribing extends AvailableBetsDescribing {
    getPaytable(): PaytableRepresenting;

    getAvailableSymbols(): string[];

    getReelsNumber(): number;

    getReelsSymbolsNumber(): number;

    isSymbolScatter(symbolId: string): boolean;

    isSymbolWild(symbolId: string): boolean;

    getSymbolsSequences(): SymbolsSequenceDescribing[];

    getWildSymbols(): string[];

    getScatterSymbols(): string[];

    getLinesDefinitions(): LinesDefinitionsDescribing;

    getLinesPatterns(): LinesPatternsDescribing;
}
