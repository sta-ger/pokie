import {SymbolsCombinationDescribing, WinningLineDescribing} from "pokie";

export interface LineWinCalculating<T extends string | number | symbol = string> {
    calculateWinningLines(
        bet: number,
        symbolsCombination: SymbolsCombinationDescribing<T>,
    ): Record<string, WinningLineDescribing<T>>;
}
