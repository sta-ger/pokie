import {SymbolsCombinationDescribing} from "pokie";

export interface SymbolsCombinationsGenerating<T extends string | number | symbol = string> {
    generateSymbolsCombination(): SymbolsCombinationDescribing<T>;

    // Optional so existing implementers of this interface keep compiling unchanged. The per-reel
    // stop position (index into that reel's SymbolsSequence) that produced the most recently
    // generated combination — needed to reconstruct/audit exactly how a given round's outcome
    // was produced (e.g. for dispute resolution or replaying a specific round).
    getLastStopPositions?(): number[];
}
