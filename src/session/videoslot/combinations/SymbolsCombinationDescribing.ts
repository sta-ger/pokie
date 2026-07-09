import type {BuildableFromMatrix} from "../../BuildableFromMatrix.js";
import type {ConvertableToMatrix} from "../../ConvertableToMatrix.js";

export interface SymbolsCombinationDescribing<T extends string | number | symbol = string>
    extends ConvertableToMatrix<T>,
        BuildableFromMatrix<T> {
    getSymbols(reelId: number): T[];
}
