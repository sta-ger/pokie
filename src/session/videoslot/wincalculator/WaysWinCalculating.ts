import {SymbolsCombinationDescribing, WinningWayDescribing} from "pokie";

export interface WaysWinCalculating<T extends string | number | symbol = string> {
    calculateWinningWays(
        bet: number,
        symbolsCombination: SymbolsCombinationDescribing<T>,
    ): Record<T, WinningWayDescribing<T>>;
}
