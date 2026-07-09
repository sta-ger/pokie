import type {LinesDefinitionsDescribing} from "../linesdefinitions/LinesDefinitionsDescribing.js";
import type {SymbolsSequenceDescribing} from "./SymbolsSequenceDescribing.js";

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
        wildSubstitutions?: Partial<Record<T, T[]>>,
    ): boolean {
        const symbolsByPattern: T[] = SymbolsCombinationsAnalyzer.getSymbolsMatchingPattern(symbols, pattern);
        const unique = Array.from(new Set(symbolsByPattern));
        const isWild = (symbol: T): boolean => Boolean(wildSymbols?.some((wildSymbol) => wildSymbol === symbol));
        const uniqueNotWilds = unique.filter((symbol) => !isWild(symbol));
        if (uniqueNotWilds.length !== 1) {
            return false;
        }
        const targetSymbol = uniqueNotWilds[0];
        // A wild with no entry in wildSubstitutions substitutes for anything (the default,
        // pre-existing behavior); a wild with an entry only substitutes for the symbols listed.
        return unique
            .filter((symbol) => isWild(symbol))
            .every((wild) => {
                const allowedSubstitutes = wildSubstitutions?.[wild];
                return allowedSubstitutes === undefined || allowedSubstitutes.includes(targetSymbol);
            });
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
        wildSubstitutions?: Partial<Record<T, T[]>>,
    ): number[] | null {
        for (const pattern of patterns) {
            if (SymbolsCombinationsAnalyzer.isMatchPattern(symbols, pattern, wildSymbols, wildSubstitutions)) {
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

    // Converts a winning line's own position format (indexes into `definition`, i.e. "which reels
    // along this line participated") into the same [reelId, rowId] grid-position pairs that
    // getScatterSymbolsPositions/getSymbolsClusters already return — e.g. for feeding into
    // collapseAndRefillSymbols alongside scatter/cluster/value win positions.
    public static getLineSymbolsGridPositions(definition: number[], symbolsPositions: number[]): number[][] {
        return symbolsPositions.map((reelId) => [reelId, definition[reelId]]);
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

    public static getSymbolsClusters<T extends string | number | symbol = string>(
        symbols: T[][],
        minimumClusterSize: number,
        wildSymbols?: T[],
        wildSubstitutions?: Partial<Record<T, T[]>>,
    ): {symbolId: T; positions: number[][]}[] {
        const isWild = (symbol: T): boolean => Boolean(wildSymbols?.some((wildSymbolId) => wildSymbolId === symbol));
        const canJoinCluster = (targetSymbol: T, candidate: T): boolean => {
            if (candidate === targetSymbol) {
                return true;
            }
            if (!isWild(candidate)) {
                return false;
            }
            const allowedSubstitutes = wildSubstitutions?.[candidate];
            return allowedSubstitutes === undefined || allowedSubstitutes.includes(targetSymbol);
        };

        const visited: boolean[][] = symbols.map((reel) => reel.map(() => false));
        const clusters: {symbolId: T; positions: number[][]}[] = [];

        for (let reelId = 0; reelId < symbols.length; reelId++) {
            for (let rowId = 0; rowId < symbols[reelId].length; rowId++) {
                if (visited[reelId][rowId] || isWild(symbols[reelId][rowId])) {
                    continue;
                }
                const targetSymbol = symbols[reelId][rowId];
                const positions: number[][] = [];
                const stack: number[][] = [[reelId, rowId]];
                visited[reelId][rowId] = true;
                while (stack.length > 0) {
                    const [r, c] = stack.pop()!;
                    positions.push([r, c]);
                    [
                        [r - 1, c],
                        [r + 1, c],
                        [r, c - 1],
                        [r, c + 1],
                    ].forEach(([nr, nc]) => {
                        if (
                            nr >= 0 &&
                            nr < symbols.length &&
                            nc >= 0 &&
                            nc < symbols[nr].length &&
                            !visited[nr][nc] &&
                            canJoinCluster(targetSymbol, symbols[nr][nc])
                        ) {
                            visited[nr][nc] = true;
                            stack.push([nr, nc]);
                        }
                    });
                }
                if (positions.length >= minimumClusterSize) {
                    clusters.push({symbolId: targetSymbol, positions});
                }
            }
        }
        return clusters;
    }

    // Combines the multiplier values carried by whichever of `positions` land on a symbol present
    // in `multiplierValues` (e.g. multiplier wilds sitting inside a winning line/cluster) — distinct
    // from value-pay (ValueWinCalculator), which pays its own independent win instead of
    // scaling someone else's. Positions on symbols absent from `multiplierValues` are skipped
    // rather than treated as a neutral value baked into `combine`, so a plain symbol never resets an
    // accumulated multiplier back to the identity. Defaults to multiplying (identity 1); pass a
    // summing `combine` with `identity = 0` for games that add multiplier wilds together instead.
    public static getPositionsMultiplier<T extends string | number | symbol = string>(
        symbols: T[][],
        positions: number[][],
        multiplierValues: Partial<Record<T, number>>,
        combine: (accumulated: number, next: number) => number = (a, b) => a * b,
        identity = 1,
    ): number {
        return positions.reduce((multiplier, [reelId, rowId]) => {
            const symbolId = symbols[reelId]?.[rowId];
            const value = symbolId === undefined ? undefined : multiplierValues[symbolId];
            return value === undefined ? multiplier : combine(multiplier, value);
        }, identity);
    }

    // Multiplicative ways-to-win evaluation (243-ways-style): for `symbolId`, counts how
    // many matching (or wild-substitutable) cells sit in reel 0, reel 1, and so on, stopping at the
    // first reel with zero matches. `waysCount` is the product of those per-reel counts — the number
    // of distinct left-to-right paths a symbol appears on — as opposed to getWinningLinesIds, which
    // enumerates every fixed row-combination as its own discrete "line" (correct but combinatorially
    // wasteful for this style of win, and it never surfaces the ways count itself).
    public static getWaysForSymbol<T extends string | number | symbol = string>(
        symbols: T[][],
        symbolId: T,
        wildSymbols?: T[],
        wildSubstitutions?: Partial<Record<T, T[]>>,
    ): {reelsMatched: number; waysCount: number; positions: number[][]} {
        const isWild = (symbol: T): boolean => Boolean(wildSymbols?.some((wildSymbolId) => wildSymbolId === symbol));
        const canSubstitute = (candidate: T): boolean => {
            if (candidate === symbolId) {
                return true;
            }
            if (!isWild(candidate)) {
                return false;
            }
            const allowedSubstitutes = wildSubstitutions?.[candidate];
            return allowedSubstitutes === undefined || allowedSubstitutes.includes(symbolId);
        };

        let waysCount = 1;
        let reelsMatched = 0;
        const positions: number[][] = [];
        for (let reelId = 0; reelId < symbols.length; reelId++) {
            const matchingRows: number[] = [];
            for (let rowId = 0; rowId < symbols[reelId].length; rowId++) {
                if (canSubstitute(symbols[reelId][rowId])) {
                    matchingRows.push(rowId);
                }
            }
            if (matchingRows.length === 0) {
                break;
            }
            reelsMatched++;
            waysCount *= matchingRows.length;
            matchingRows.forEach((rowId) => positions.push([reelId, rowId]));
        }
        return {reelsMatched, waysCount: reelsMatched > 0 ? waysCount : 0, positions};
    }

    // Pure grid transform for cascade-style mechanics: clears the given positions, lets the
    // remaining symbols in each affected reel fall towards the higher row index (row 0 is treated
    // as the top, gravity pulls down), and fills the freed slots at the top from
    // `refillSymbolsPerReel` — the caller decides how those replacement symbols were drawn (this
    // stays RNG-free on purpose). Duplicate entries in `positionsToRemove` are safe (a position is
    // either removed or not). Extra refill symbols beyond what a reel needs are ignored; providing
    // too few for a reel throws, since silently returning a short reel would corrupt the grid.
    public static collapseAndRefillSymbols<T extends string | number | symbol = string>(
        symbols: T[][],
        positionsToRemove: number[][],
        refillSymbolsPerReel: T[][],
    ): T[][] {
        const removedRowsByReel: Set<number>[] = symbols.map(() => new Set<number>());
        positionsToRemove.forEach(([reelId, rowId]) => {
            removedRowsByReel[reelId]?.add(rowId);
        });

        return symbols.map((reelSymbols, reelId) => {
            const remaining = reelSymbols.filter((_, rowId) => !removedRowsByReel[reelId].has(rowId));
            const removedCount = reelSymbols.length - remaining.length;
            const refill = refillSymbolsPerReel[reelId] ?? [];
            if (refill.length < removedCount) {
                throw new Error(
                    `Not enough refill symbols for reel ${reelId}: need ${removedCount}, got ${refill.length}`,
                );
            }
            return [...refill.slice(0, removedCount), ...remaining];
        });
    }

    // Pure grid transform for "stamp a symbol onto specific cells" mechanics: expanding wilds
    // (override a whole reel), walking/random wilds (override scattered empty cells before win
    // evaluation), sticky wilds/Hold & Win respins (override held positions on a freshly generated
    // grid), mystery-symbol reveal (override every mystery placeholder with the resolved symbol).
    // No gravity, no removal — just direct placement. Later entries in `overrides` win ties on the
    // same position. Out-of-range positions are ignored rather than throwing.
    public static overlaySymbols<T extends string | number | symbol = string>(
        symbols: T[][],
        overrides: {position: number[]; symbolId: T}[],
    ): T[][] {
        const result = symbols.map((reelSymbols) => [...reelSymbols]);
        overrides.forEach(({position: [reelId, rowId], symbolId}) => {
            if (result[reelId] && rowId >= 0 && rowId < result[reelId].length) {
                result[reelId][rowId] = symbolId;
            }
        });
        return result;
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
        wildSubstitutions?: Partial<Record<T, T[]>>,
    ): string[] {
        const lines: string[] = linesDefinitions.getLinesIds();
        const ids: string[] = lines.filter((lineId: string) => {
            const symbolsLine: T[] = SymbolsCombinationsAnalyzer.getSymbolsForDefinition(
                symbols,
                linesDefinitions.getLineDefinition(lineId),
            );
            return (
                SymbolsCombinationsAnalyzer.getMatchingPattern(
                    symbolsLine,
                    patterns,
                    wildSymbols,
                    wildSubstitutions,
                ) !== null
            );
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
