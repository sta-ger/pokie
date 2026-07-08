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

    // Optional so existing implementers of this interface keep compiling unchanged. Absent (or an
    // empty map) means every wild substitutes for any symbol — the pre-existing default behavior.
    // A wild present as a key only substitutes for the symbols listed for it.
    getWildSubstitutions?(): Partial<Record<T, T[]>>;
}
