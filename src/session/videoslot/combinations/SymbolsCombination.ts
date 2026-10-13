import {ScreenProjection} from "../coordinates/ScreenProjection.js";
import type {ScreenGeometry, ScreenCoordinateSpace} from "../coordinates/ScreenGeometry.js";
import type {SymbolsCombinationDescribing} from "./SymbolsCombinationDescribing.js";

export class SymbolsCombination<T extends string | number | symbol = string>
implements SymbolsCombinationDescribing<T> {
    private combination: T[][] = [];
    private geometry?: ScreenGeometry;
    private variableReelHeights = false;
    private space: ScreenCoordinateSpace = "generated";

    public withVariableReelHeights(): this {
        this.variableReelHeights = true;
        return this;
    }

    public hasVariableReelHeights(): boolean {
        return this.variableReelHeights;
    }

    public withCoordinates(geometry: ScreenGeometry, space: ScreenCoordinateSpace = "generated"): this {
        const projection = new ScreenProjection(geometry);
        projection.assertMatrix(this.combination, space);
        this.geometry = projection.getGeometry();
        this.space = space;
        return this;
    }

    public getScreenGeometry(): ScreenGeometry | undefined {
        return this.geometry && new ScreenProjection(this.geometry).getGeometry();
    }

    public getCoordinateSpace(): ScreenCoordinateSpace {
        return this.space;
    }

    public getSymbols(reelId: number): T[] {
        return this.combination[reelId];
    }

    public fromMatrix(value: T[][], transposed = false): this {
        this.combination = JSON.parse(JSON.stringify(transposed ? this.transposeArray(value) : value));
        return this;
    }

    public toMatrix(transposed = false): T[][] {
        return JSON.parse(JSON.stringify(transposed ? this.transposeArray(this.combination) : this.combination));
    }

    private transposeArray(source: T[][]): T[][] {
        const r: T[][] = [];
        let i: number;
        let j: number;
        for (i = 0; i < source.length; i++) {
            for (j = 0; j < source[i].length; j++) {
                if (r[j] === undefined) {
                    r[j] = [];
                }
                r[j][i] = source[i][j];
            }
        }
        return r;
    }
}
