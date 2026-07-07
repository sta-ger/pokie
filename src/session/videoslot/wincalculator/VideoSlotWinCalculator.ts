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

export class VideoSlotWinCalculator<T extends string | number | symbol = string> implements VideoSlotWinCalculating<T> {
    private readonly config: VideoSlotConfigDescribing<T>;

    private symbolsCombination!: SymbolsCombinationDescribing<T>;
    private winningLines: Record<string, WinningLine<T>> = {};
    private winningScatters: Record<T, WinningScatter<T>> = {} as Record<T, WinningScatter<T>>;

    constructor(conf: VideoSlotConfigDescribing<T>) {
        this.config = conf;
    }

    public calculateWin(bet: number, symbolsCombination: SymbolsCombinationDescribing<T>): void {
        if (this.config.getAvailableBets().some((availableBet) => availableBet === bet)) {
            this.symbolsCombination = symbolsCombination;
            this.calculateWinningLinesAndScatters(bet);
        } else {
            throw new Error(`Bet ${bet} is not specified at paytable`);
        }
    }

    public getWinningLines(): Record<string, WinningLineDescribing<T>> {
        return this.winningLines;
    }

    public getWinningScatters(): Record<T, WinningScatterDescribing<T>> {
        return this.winningScatters;
    }

    public getWinAmount(): number {
        return this.getLinesWinning() + this.getScattersWinning();
    }

    public getLinesWinning(): number {
        return Object.values(this.getWinningLines()).reduce((sum, line) => sum + line.getWinAmount(), 0);
    }

    public getScattersWinning(): number {
        // Object.values() on a Record keyed by a generic type parameter loses its value type,
        // so it's cast back to a string-keyed view (safe: JS object keys are always strings/symbols
        // at runtime regardless of T).
        const scatters = this.getWinningScatters() as unknown as Record<string, WinningScatter<T>>;
        return Object.values(scatters).reduce((sum, scatter) => sum + scatter.getWinAmount(), 0);
    }

    private calculateWinningLinesAndScatters(bet: number): void {
        let line: WinningLine<T>;
        this.winningLines = {};
        const winningLinesIds = SymbolsCombinationsAnalyzer.getWinningLinesIds<T>(
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

    private generateWinningLine(bet: number, lineId: string): WinningLine<T> {
        const definition = this.config.getLinesDefinitions().getLineDefinition(lineId);
        const symbolsLine = SymbolsCombinationsAnalyzer.getSymbolsForDefinition<T>(
            this.symbolsCombination.toMatrix(),
            definition,
        );
        const pattern = SymbolsCombinationsAnalyzer.getMatchingPattern<T>(
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

    private generateWinningScatters(bet: number): Record<T, WinningScatter<T>> {
        const rv = {} as Record<T, WinningScatter<T>>;
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
                    rv[curScatterSymbolId] = new WinningScatter<T>(
                        curScatterSymbolId,
                        curScatterSymbolsPositions,
                        winAmount,
                    );
                }
            }
        }
        return rv;
    }

    private getScatterSymbolsPositions(symbolId: T): number[][] {
        return SymbolsCombinationsAnalyzer.getScatterSymbolsPositions<T>(this.symbolsCombination.toMatrix(), symbolId);
    }
}
