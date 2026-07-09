import type {SymbolsCombinationDescribing} from "../combinations/SymbolsCombinationDescribing.js";
import type {WinningLineDescribing} from "../WinningLineDescribing.js";

export interface LineWinCalculating<T extends string | number | symbol = string> {
    calculateWinningLines(
        bet: number,
        symbolsCombination: SymbolsCombinationDescribing<T>,
    ): Record<string, WinningLineDescribing<T>>;
}
