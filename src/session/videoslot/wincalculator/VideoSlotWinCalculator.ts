import {
    SymbolsCombinationDescribing,
    SymbolsCombinationsAnalyzer,
    VideoSlotConfigDescribing,
    VideoSlotWinCalculating,
    WinningLine,
    WinningLineDescribing,
    WinningScatter,
    WinningScatterDescribing,
} from "pokie";

export class VideoSlotWinCalculator implements VideoSlotWinCalculating {
    private readonly config: VideoSlotConfigDescribing;

    private symbolsCombination!: SymbolsCombinationDescribing;
    private winningLines: Record<string, WinningLine> = {};
    private winningScatters: Record<string, WinningScatter> = {};

    constructor(conf: VideoSlotConfigDescribing) {
        this.config = conf;
    }

    public calculateWin(bet: number, symbolsCombination: SymbolsCombinationDescribing): void {
        if (this.config.getAvailableBets().some((availableBet) => availableBet === bet)) {
            this.symbolsCombination = symbolsCombination;
            this.calculateWinningLinesAndScatters(bet);
        } else {
            throw new Error(`Bet ${bet} is not specified at paytable`);
        }
    }

    public getWinningLines(): Record<string, WinningLineDescribing> {
        return this.winningLines;
    }

    public getWinningScatters(): Record<string, WinningScatterDescribing> {
        return this.winningScatters;
    }

    public getWinAmount(): number {
        return this.getLinesWinning() + this.getScattersWinning();
    }

    public getLinesWinning(): number {
        return Object.values(this.getWinningLines()).reduce((sum, line) => sum + line.getWinAmount(), 0);
    }

    public getScattersWinning(): number {
        return Object.values(this.getWinningScatters()).reduce((sum, scatter) => sum + scatter.getWinAmount(), 0);
    }

    private calculateWinningLinesAndScatters(bet: number): void {
        let line: WinningLine;
        this.winningLines = {};
        const winningLinesIds = SymbolsCombinationsAnalyzer.getWinningLinesIds(
            this.symbolsCombination.toMatrix(),
            this.config.getLinesDefinitions(),
            this.config.getLinesPatterns().toArray(),
            this.config.getWildSymbols(),
        );
        winningLinesIds.forEach((lineId) => {
            line = this.generateWinningLine(bet, lineId);
            if (
                !this.config.getScatterSymbols().some((scatter) => scatter === line.getSymbolId()) &&
                line.getWinAmount() > 0
            ) {
                this.winningLines[line.getLineId()] = line;
            }
        });
        this.winningScatters = this.generateWinningScatters(bet);
    }

    private generateWinningLine(bet: number, lineId: string): WinningLine {
        const definition = this.config.getLinesDefinitions().getLineDefinition(lineId);
        const symbolsLine = SymbolsCombinationsAnalyzer.getSymbolsForDefinition(
            this.symbolsCombination.toMatrix(),
            definition,
        );
        const pattern = SymbolsCombinationsAnalyzer.getMatchingPattern(
            symbolsLine,
            this.config.getLinesPatterns().toArray(),
            this.config.getWildSymbols(),
        )!;
        const symbolsPositions = pattern.reduce((acc: number[], value: number, index: number) => {
            if (value === 1) {
                acc.push(index);
            }
            return acc;
        }, []);
        const symbolId = SymbolsCombinationsAnalyzer.getWinningSymbolId(
            symbolsLine,
            pattern,
            this.config.getWildSymbols(),
        )!;
        const wildSymbolsPositions = SymbolsCombinationsAnalyzer.getWildSymbolsPositions(
            symbolsLine,
            pattern,
            this.config.getWildSymbols(),
        );
        const winAmount = this.getWinAmountForSymbol(bet, symbolId, symbolsPositions.length);
        return new WinningLine(
            winAmount,
            definition,
            pattern,
            lineId,
            symbolsPositions,
            wildSymbolsPositions,
            symbolId,
        );
    }

    private getWinAmountForSymbol(bet: number, symbolId: string, numOfWinningSymbols: number): number {
        return this.config.getPaytable().getWinAmountForSymbol(symbolId, numOfWinningSymbols, bet);
    }

    private generateWinningScatters(bet: number): Record<string, WinningScatter> {
        const rv: Record<string, WinningScatter> = {};
        if (this.config.getScatterSymbols() !== null) {
            for (const scatter of this.config.getScatterSymbols()) {
                const curScatterSymbolId = scatter;
                const curScatterSymbolsPositions = this.getScatterSymbolsPositions(curScatterSymbolId);
                const winAmount = this.getWinAmountForSymbol(
                    bet,
                    curScatterSymbolId,
                    curScatterSymbolsPositions.length,
                );
                if (winAmount > 0) {
                    rv[curScatterSymbolId] = new WinningScatter(
                        curScatterSymbolId,
                        curScatterSymbolsPositions,
                        winAmount,
                    );
                }
            }
        }
        return rv;
    }

    private getScatterSymbolsPositions(symbolId: string): number[][] {
        return SymbolsCombinationsAnalyzer.getScatterSymbolsPositions(this.symbolsCombination.toMatrix(), symbolId);
    }
}
