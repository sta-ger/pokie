import {SymbolsCombinationDescribing, WinningValueDescribing} from "pokie";

export interface ValueWinCalculating<T extends string | number | symbol = string> {
    calculateWinningValues(
        bet: number,
        symbolsCombination: SymbolsCombinationDescribing<T>,
    ): Record<T, WinningValueDescribing<T>>;
}
