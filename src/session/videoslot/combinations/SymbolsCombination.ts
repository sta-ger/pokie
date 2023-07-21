import {SymbolsCombinationDescribing} from "pokie";

export class SymbolsCombination implements SymbolsCombinationDescribing {
    private combination: string[][] = [];

    public getSymbols(reelId: number): string[] {
        return this.combination[reelId];
    }

    public fromMatrix(value: string[][], transposed = false): this {
        this.combination = JSON.parse(JSON.stringify(transposed ? this.transposeArray(value) : value));
        return this;
    }

    public toMatrix(transposed = false): string[][] {
        return JSON.parse(JSON.stringify(transposed ? this.transposeArray(this.combination) : this.combination));
    }

    private transposeArray(source: string[][]): string[][] {
        const r: string[][] = [];
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
