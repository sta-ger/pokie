import type {SymbolsCombinationDescribing} from "../combinations/SymbolsCombinationDescribing.js";
import type {WinningScatterDescribing} from "../WinningScatterDescribing.js";

export interface ScatterWinCalculating<T extends string | number | symbol = string> {
    calculateWinningScatters(
        bet: number,
        symbolsCombination: SymbolsCombinationDescribing<T>,
    ): Record<T, WinningScatterDescribing<T>>;
}
