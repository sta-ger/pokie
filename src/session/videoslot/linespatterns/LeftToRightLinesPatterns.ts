import {LinesPatternsDescribing} from "pokie";

export class LeftToRightLinesPatterns implements LinesPatternsDescribing {
    private readonly patterns: number[][];

    constructor(reelsNumber: number, minimumWinningSymbols = 2) {
        this.patterns = new Array(reelsNumber - (minimumWinningSymbols - 1));
        for (let i = 0; i < reelsNumber - (minimumWinningSymbols - 1); i++) {
            const arr: number[] = Array(reelsNumber).fill(0);
            for (let j = 0; j < reelsNumber - i; j++) {
                arr[j] = 1;
            }
            this.patterns[i] = arr;
        }
    }

    public toArray(): number[][] {
        return [...this.patterns];
    }
}
