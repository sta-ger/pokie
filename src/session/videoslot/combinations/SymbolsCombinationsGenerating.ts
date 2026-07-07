import {SymbolsCombinationDescribing} from "pokie";

export interface SymbolsCombinationsGenerating<T extends string | number | symbol = string> {
    generateSymbolsCombination(): SymbolsCombinationDescribing<T>;
}
