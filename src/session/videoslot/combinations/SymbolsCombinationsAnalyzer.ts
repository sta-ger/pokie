import {LinesDefinitionsDescribing} from "pokie";

export class SymbolsCombinationsAnalyzer {
    public static getSymbolsForDefinition(symbols: string[][], definition: number[]): string[] {
        return definition.map((col, index) => symbols[index][col]);
    }

    public static getSymbolsMatchingPattern(symbols: string[], pattern: number[]): string[] {
        return symbols.filter((_, i: number) => pattern[i] === 1);
    }

    public static isMatchPattern(symbols: string[], pattern: number[], wildSymbols?: string[]): boolean {
        const symbolsByPattern: string[] = SymbolsCombinationsAnalyzer.getSymbolsMatchingPattern(symbols, pattern);
        const unique = Array.from(new Set(symbolsByPattern));
        const uniqueNotWilds = unique.filter((symbol) => !wildSymbols?.some((wildSymbol) => wildSymbol === symbol));
        return uniqueNotWilds.length === 1;
    }

    public static getWinningSymbolId(symbols: string[], pattern: number[], wildSymbols?: string[]): string | null {
        const symbolsByPattern: string[] = SymbolsCombinationsAnalyzer.getSymbolsMatchingPattern(symbols, pattern);
        const unique: Set<string> = new Set(symbolsByPattern);
        let prev: string | null = null;
        unique.forEach((cur) => {
            if (!wildSymbols?.some((wild) => wild === cur)) {
                prev = cur;
            }
        });
        return prev;
    }

    public static getMatchingPattern(symbols: string[], patterns: number[][], wildSymbols?: string[]): number[] | null {
        for (const pattern of patterns) {
            if (SymbolsCombinationsAnalyzer.isMatchPattern(symbols, pattern, wildSymbols)) {
                return pattern;
            }
        }
        return null;
    }

    public static getWildSymbolsPositions(symbols: string[], pattern: number[], wildSymbols: string[]): number[] {
        return symbols
            .map((symbol: string, i: number) =>
                wildSymbols.some((wildSymbolId) => symbol === wildSymbolId) && pattern[i] === 1 ? i : -1,
            )
            .filter((index: number) => index !== -1);
    }

    public static getScatterSymbolsPositions(symbols: string[][], scatterSymbolId: string): number[][] {
        const r: number[][] = [];
        for (let i = 0; i < symbols.length; i++) {
            for (let j = 0; j < symbols[i].length; j++) {
                if (symbols[i][j] === scatterSymbolId) {
                    r.push([i, j]);
                }
            }
        }
        return r;
    }

    public static getWinningLinesIds(
        symbols: string[][],
        linesDefinitions: LinesDefinitionsDescribing,
        patterns: number[][],
        wildSymbols?: string[],
    ): string[] {
        const lines: string[] = linesDefinitions.getLinesIds();
        const ids: string[] = lines.filter((lineId: string) => {
            const symbolsLine: string[] = SymbolsCombinationsAnalyzer.getSymbolsForDefinition(
                symbols,
                linesDefinitions.getLineDefinition(lineId),
            );
            return SymbolsCombinationsAnalyzer.getMatchingPattern(symbolsLine, patterns, wildSymbols) !== null;
        });
        ids.sort();
        return ids;
    }
}
