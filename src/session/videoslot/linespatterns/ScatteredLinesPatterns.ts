import {LinesPatternsDescribing} from "pokie";

export class ScatteredLinesPatterns implements LinesPatternsDescribing {
    private readonly patterns: number[][];

    constructor(size: number, minimumWinningSymbols = 2) {
        const combinations: number[][] = [];
        const totalCombinations = 2 ** size;

        for (let i = 0; i < totalCombinations; i++) {
            const binaryString = i.toString(2).padStart(size, "0");
            const combination = binaryString.split("").map(Number);
            combinations.push(combination);
        }

        this.patterns = combinations.filter(
            (pattern) => pattern.reduce((sum, value) => (value ? ++sum : sum)) >= minimumWinningSymbols,
        );
    }

    public toArray(): number[][] {
        return [...this.patterns];
    }
}
