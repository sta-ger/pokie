import {LinesDefinitionsDescribing, SymbolsSequenceDescribing} from "pokie";

export class SymbolsCombinationsAnalyzer {
    public static getSymbolsForDefinition<T extends string | number | symbol = string>(
        symbols: T[][],
        definition: number[],
    ): T[] {
        return definition.map((col, index) => symbols[index][col]);
    }

    public static getSymbolsMatchingPattern<T extends string | number | symbol = string>(
        symbols: T[],
        pattern: number[],
    ): T[] {
        return symbols.filter((_, i: number) => pattern[i] === 1);
    }

    public static isMatchPattern<T extends string | number | symbol = string>(
        symbols: T[],
        pattern: number[],
        wildSymbols?: T[],
    ): boolean {
        const symbolsByPattern: T[] = SymbolsCombinationsAnalyzer.getSymbolsMatchingPattern(symbols, pattern);
        const unique = Array.from(new Set(symbolsByPattern));
        const uniqueNotWilds = unique.filter((symbol) => !wildSymbols?.some((wildSymbol) => wildSymbol === symbol));
        return uniqueNotWilds.length === 1;
    }

    public static getWinningSymbolId<T extends string | number | symbol = string>(
        symbols: T[],
        pattern: number[],
        wildSymbols?: T[],
    ): T | null {
        const symbolsByPattern: T[] = SymbolsCombinationsAnalyzer.getSymbolsMatchingPattern(symbols, pattern);
        const unique: Set<T> = new Set(symbolsByPattern);
        let prev: T | null = null;
        unique.forEach((cur) => {
            if (!wildSymbols?.some((wild) => wild === cur)) {
                prev = cur;
            }
        });
        return prev;
    }

    public static getMatchingPattern<T extends string | number | symbol = string>(
        symbols: T[],
        patterns: number[][],
        wildSymbols?: T[],
    ): number[] | null {
        for (const pattern of patterns) {
            if (SymbolsCombinationsAnalyzer.isMatchPattern(symbols, pattern, wildSymbols)) {
                return pattern;
            }
        }
        return null;
    }

    public static getWildSymbolsPositions<T extends string | number | symbol = string>(
        symbols: T[],
        pattern: number[],
        wildSymbols: T[],
    ): number[] {
        return symbols
            .map((symbol: T, i: number) =>
                wildSymbols.some((wildSymbolId) => symbol === wildSymbolId) && pattern[i] === 1 ? i : -1,
            )
            .filter((index: number) => index !== -1);
    }

    public static getScatterSymbolsPositions<T extends string | number | symbol = string>(
        symbols: T[][],
        scatterSymbolId: T,
    ): number[][] {
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

    public static getSymbolsCount<T extends string | number | symbol = string>(symbols: T[][], symbolId: T): number {
        return symbols.reduce(
            (count, reelSymbols) => count + reelSymbols.filter((symbol) => symbol === symbolId).length,
            0,
        );
    }

    public static getSymbolsFrequency<T extends string | number | symbol = string>(symbols: T[][]): Record<T, number> {
        const frequency = {} as Record<T, number>;
        symbols.forEach((reelSymbols) =>
            reelSymbols.forEach((symbol) => {
                frequency[symbol] = (frequency[symbol] ?? 0) + 1;
            }),
        );
        return frequency;
    }

    public static getWinningLinesIds<T extends string | number | symbol = string>(
        symbols: T[][],
        linesDefinitions: LinesDefinitionsDescribing,
        patterns: number[][],
        wildSymbols?: T[],
    ): string[] {
        const lines: string[] = linesDefinitions.getLinesIds();
        const ids: string[] = lines.filter((lineId: string) => {
            const symbolsLine: T[] = SymbolsCombinationsAnalyzer.getSymbolsForDefinition(
                symbols,
                linesDefinitions.getLineDefinition(lineId),
            );
            return SymbolsCombinationsAnalyzer.getMatchingPattern(symbolsLine, patterns, wildSymbols) !== null;
        });
        ids.sort();
        return ids;
    }

    public static getAllPossibleSymbolsCombinations<T extends string | number | symbol = string>(
        sequences: SymbolsSequenceDescribing<T>[],
        symbolsNumber: number,
    ): T[][][] {
        // Each reel only has `getSize()` distinct visible windows, so precompute them once
        // instead of recomputing the same window on every combination that includes it.
        const reelsWindows: T[][][] = sequences.map((sequence) => {
            const windows: T[][] = new Array(sequence.getSize());
            for (let position = 0; position < sequence.getSize(); position++) {
                windows[position] = sequence.getSymbols(position, symbolsNumber);
            }
            return windows;
        });
        const reelsSizes: number[] = reelsWindows.map((windows) => windows.length);

        const allPossibleSymbolsCombinations: T[][][] = [];
        const stopPositions: number[] = new Array(reelsWindows.length).fill(0);
        for (;;) {
            allPossibleSymbolsCombinations.push(
                stopPositions.map((position, reelId) => reelsWindows[reelId][position]),
            );

            let reelId = stopPositions.length - 1;
            while (reelId >= 0 && ++stopPositions[reelId] === reelsSizes[reelId]) {
                stopPositions[reelId] = 0;
                reelId--;
            }
            if (reelId < 0) {
                break;
            }
        }
        return allPossibleSymbolsCombinations;
    }

    public static getCombinationProbability<T extends string | number | symbol = string>(
        sequences: SymbolsSequenceDescribing<T>[],
    ): number {
        // Every reel stop is drawn uniformly (see SymbolsCombinationsGenerator), so a single
        // combination's probability is the product of each reel's 1-in-getSize() chance.
        return sequences.reduce((probability, sequence) => probability / sequence.getSize(), 1);
    }

    public static getUniqueCombinationsWithWeights<T extends string | number | symbol = string>(
        combinations: T[][][],
    ): {combination: T[][]; weight: number}[] {
        const entriesByKey = new Map<string, {combination: T[][]; weight: number}>();
        combinations.forEach((combination) => {
            const key = JSON.stringify(combination);
            const entry = entriesByKey.get(key);
            if (entry) {
                entry.weight++;
            } else {
                entriesByKey.set(key, {combination, weight: 1});
            }
        });
        return Array.from(entriesByKey.values());
    }

    public static areCombinationsEqual<T extends string | number | symbol = string>(a: T[][], b: T[][]): boolean {
        return JSON.stringify(a) === JSON.stringify(b);
    }
}
