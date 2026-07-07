import {SymbolsCombinationDescribing} from "pokie";

export class SymbolsCombination<T extends string | number | symbol = string>
implements SymbolsCombinationDescribing<T> {
    private combination: T[][] = [];

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
