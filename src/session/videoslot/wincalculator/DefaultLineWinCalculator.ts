import {
    LineWinCalculating,
    SymbolsCombinationDescribing,
    SymbolsCombinationsAnalyzer,
    VideoSlotConfigDescribing,
    WinningLine,
    WinningLineDescribing,
} from "pokie";

export class DefaultLineWinCalculator<T extends string | number | symbol = string> implements LineWinCalculating<T> {
    private readonly config: VideoSlotConfigDescribing<T>;

    constructor(config: VideoSlotConfigDescribing<T>) {
        this.config = config;
    }

    public calculateWinningLines(
        bet: number,
        symbolsCombination: SymbolsCombinationDescribing<T>,
    ): Record<string, WinningLineDescribing<T>> {
        const winningLines: Record<string, WinningLineDescribing<T>> = {};
        const winningLinesIds = SymbolsCombinationsAnalyzer.getWinningLinesIds<T>(
            symbolsCombination.toMatrix(),
            this.config.getLinesDefinitions(),
            this.config.getLinesPatterns().toArray(),
            this.config.getWildSymbols(),
            this.config.getWildSubstitutions?.(),
        );
        winningLinesIds.forEach((lineId) => {
            const line = this.generateWinningLine(bet, lineId, symbolsCombination);
            if (
                !this.config.getScatterSymbols().some((scatter) => scatter === line.getSymbolId()) &&
                line.getWinAmount() > 0
            ) {
                winningLines[line.getLineId()] = line;
            }
        });
        return winningLines;
    }

    private generateWinningLine(
        bet: number,
        lineId: string,
        symbolsCombination: SymbolsCombinationDescribing<T>,
    ): WinningLine<T> {
        const definition = this.config.getLinesDefinitions().getLineDefinition(lineId);
        const symbolsLine = SymbolsCombinationsAnalyzer.getSymbolsForDefinition<T>(
            symbolsCombination.toMatrix(),
            definition,
        );
        const pattern = SymbolsCombinationsAnalyzer.getMatchingPattern<T>(
            symbolsLine,
            this.config.getLinesPatterns().toArray(),
            this.config.getWildSymbols(),
            this.config.getWildSubstitutions?.(),
        )!;
        const symbolsPositions = pattern.reduce((acc: number[], value: number, index: number) => {
            if (value === 1) {
                acc.push(index);
            }
            return acc;
        }, []);
        const symbolId = SymbolsCombinationsAnalyzer.getWinningSymbolId<T>(
            symbolsLine,
            pattern,
            this.config.getWildSymbols(),
        )!;
        const wildSymbolsPositions = SymbolsCombinationsAnalyzer.getWildSymbolsPositions<T>(
            symbolsLine,
            pattern,
            this.config.getWildSymbols(),
        );
        const winAmount = this.getWinAmountForSymbol(bet, symbolId, symbolsPositions.length);
        return new WinningLine<T>(
            winAmount,
            definition,
            pattern,
            lineId,
            symbolsPositions,
            wildSymbolsPositions,
            symbolId,
        );
    }

    private getWinAmountForSymbol(bet: number, symbolId: T, numOfWinningSymbols: number): number {
        return this.config.getPaytable().getWinAmountForSymbol(symbolId, numOfWinningSymbols, bet);
    }
}
