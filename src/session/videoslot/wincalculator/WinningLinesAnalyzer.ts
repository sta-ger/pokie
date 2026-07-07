import {SymbolsCombinationsAnalyzer, WinningLineDescribing} from "pokie";

export class WinningLinesAnalyzer {
    public static allLinesHaveSameSymbolId<T extends string | number | symbol = string>(
        lines: WinningLineDescribing<T>[],
    ): boolean {
        let id: T | null = null;
        let result = true;
        for (const line of lines) {
            if (id === null) {
                id = line.getSymbolId();
            } else if (lines.length > 1 && id !== line.getSymbolId()) {
                result = false;
                break;
            }
        }
        return result;
    }

    public static getLinesWithSymbol<T extends string | number | symbol = string>(
        lines: WinningLineDescribing<T>[],
        symbolsCombination: T[][],
        symbolId: T,
    ): WinningLineDescribing<T>[] {
        const result: WinningLineDescribing<T>[] = [];
        for (const line of lines) {
            const lineSymbols = SymbolsCombinationsAnalyzer.getSymbolsForDefinition<T>(
                symbolsCombination,
                line.getDefinition(),
            );
            for (const lineSymbol of lineSymbols) {
                if (lineSymbol === symbolId) {
                    result.push(line);
                    break;
                }
            }
        }
        return result;
    }

    public static getLinesWithWinningSymbol<T extends string | number | symbol = string>(
        lines: WinningLineDescribing<T>[],
        symbolId: T,
    ): WinningLineDescribing<T>[] {
        const result: WinningLineDescribing<T>[] = [];
        for (const line of lines) {
            if (line.getSymbolId() === symbolId) {
                result.push(line);
            }
        }
        return result;
    }

    public static getLinesWithDifferentWinningSymbols<T extends string | number | symbol = string>(
        lines: WinningLineDescribing<T>[],
    ): WinningLineDescribing<T>[] {
        const symbols: T[] = [];
        const result: WinningLineDescribing<T>[] = [];
        for (const line of lines) {
            if (symbols.indexOf(line.getSymbolId()) < 0) {
                symbols.push(line.getSymbolId());
                result.push(line);
            }
        }
        return result.length > 1 ? result : [];
    }
}
