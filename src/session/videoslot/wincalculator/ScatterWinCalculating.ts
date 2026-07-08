import {SymbolsCombinationDescribing, WinningScatterDescribing} from "pokie";

export interface ScatterWinCalculating<T extends string | number | symbol = string> {
    calculateWinningScatters(
        bet: number,
        symbolsCombination: SymbolsCombinationDescribing<T>,
    ): Record<T, WinningScatterDescribing<T>>;
}
