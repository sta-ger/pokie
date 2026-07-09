import type {SymbolsCombinationDescribing} from "../combinations/SymbolsCombinationDescribing.js";
import type {WinningWayDescribing} from "../WinningWayDescribing.js";

export interface WaysWinCalculating<T extends string | number | symbol = string> {
    calculateWinningWays(
        bet: number,
        symbolsCombination: SymbolsCombinationDescribing<T>,
    ): Record<T, WinningWayDescribing<T>>;
}
