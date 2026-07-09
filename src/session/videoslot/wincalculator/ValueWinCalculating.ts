import type {SymbolsCombinationDescribing} from "../combinations/SymbolsCombinationDescribing.js";
import type {WinningValueDescribing} from "../WinningValueDescribing.js";

export interface ValueWinCalculating<T extends string | number | symbol = string> {
    calculateWinningValues(
        bet: number,
        symbolsCombination: SymbolsCombinationDescribing<T>,
    ): Record<T, WinningValueDescribing<T>>;
}
