import {LeftToRightLinesPatterns, LinesPatternsDescribing} from "pokie";

export class RightToLeftLinesPatterns extends LeftToRightLinesPatterns implements LinesPatternsDescribing {
    private readonly rightToLeftPatterns: number[][];

    constructor(reelsNumber: number, minimumWinningSymbols = 2) {
        super(reelsNumber, minimumWinningSymbols);
        this.rightToLeftPatterns = super.toArray();
        this.rightToLeftPatterns.map((pattern) => pattern.reverse());
    }

    public toArray(): number[][] {
        return [...this.rightToLeftPatterns];
    }
}
