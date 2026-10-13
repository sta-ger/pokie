import type {ReelSequenceSelection, ReelSequenceStatistics} from "./WeightedSequenceVariant.js";
import type {ScreenGeometry} from "../coordinates/ScreenGeometry.js";
import type {SymbolsCombinationDescribing} from "./SymbolsCombinationDescribing.js";

export interface SymbolsCombinationsGenerating<T extends string | number | symbol = string> {
    validateSequenceDefinitions?(): void;
    acceptsWeightedDefinitions?(): boolean;
    setSelectionContext?(context: string): void;
    getSequenceSelections?(): ReelSequenceSelection[];
    getSequenceStatistics?(): ReelSequenceStatistics[];
    generateSymbolsCombination(): SymbolsCombinationDescribing<T>;

    /** Authoritative next-generation contract. An undefined return means ordinary coordinates,
     * even if the previous combination was tagged. Absent capability retains legacy tag detection.
     */
    getScreenGeometry?(): ScreenGeometry | undefined;

    // Optional so existing implementers of this interface keep compiling unchanged. The per-reel
    // stop position (index into that reel's SymbolsSequence) that produced the most recently
    // generated combination — needed to reconstruct/audit exactly how a given round's outcome
    // was produced (e.g. for dispute resolution or replaying a specific round).
    getLastStopPositions?(): number[];
}
