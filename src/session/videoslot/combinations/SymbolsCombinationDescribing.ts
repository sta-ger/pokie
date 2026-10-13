import type {ScreenGeometry, ScreenCoordinateSpace} from "../coordinates/ScreenGeometry.js";
import type {BuildableFromMatrix} from "../../BuildableFromMatrix.js";
import type {ConvertableToMatrix} from "../../ConvertableToMatrix.js";

export interface SymbolsCombinationDescribing<T extends string | number | symbol = string>
    extends ConvertableToMatrix<T>,
        BuildableFromMatrix<T> {
    hasVariableReelHeights?(): boolean;
    getScreenGeometry?(): ScreenGeometry | undefined;
    getCoordinateSpace?(): ScreenCoordinateSpace;

    getSymbols(reelId: number): T[];
}
