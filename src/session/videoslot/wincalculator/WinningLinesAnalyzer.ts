import {SymbolsCombinationsAnalyzer, WinningLineDescribing} from "pokie";

export class WinningLinesAnalyzer {
    public static allLinesHaveSameSymbolId(lines: WinningLineDescribing[]): boolean {
        let id: string | null = null;
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

    public static getLinesWithSymbol(
        lines: WinningLineDescribing[],
        symbolsCombination: string[][],
        symbolId: string,
    ): WinningLineDescribing[] {
        const result: WinningLineDescribing[] = [];
        for (const line of lines) {
            const lineSymbols = SymbolsCombinationsAnalyzer.getSymbolsForDefinition(
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

    public static getLinesWithWinningSymbol(lines: WinningLineDescribing[], symbolId: string): WinningLineDescribing[] {
        const result: WinningLineDescribing[] = [];
        for (const line of lines) {
            if (line.getSymbolId() === symbolId) {
                result.push(line);
            }
        }
        return result;
    }

    public static getLinesWithDifferentWinningSymbols(lines: WinningLineDescribing[]): WinningLineDescribing[] {
        const symbols: string[] = [];
        const result: WinningLineDescribing[] = [];
        for (const line of lines) {
            if (symbols.indexOf(line.getSymbolId()) < 0) {
                symbols.push(line.getSymbolId());
                result.push(line);
            }
        }
        return result.length > 1 ? result : [];
    }
}
