import {BuildableFromMatrix, ConvertableToMatrix} from "pokie";

export interface SymbolsCombinationDescribing<T extends string | number | symbol = string>
    extends ConvertableToMatrix<T>,
        BuildableFromMatrix<T> {
    getSymbols(reelId: number): T[];
}
