import {NextSessionRoundPlayableDetermining, VideoSlotSessionHandling, WinningLinesAnalyzer} from "pokie";

export class PlayUntilSymbolWinStrategy implements NextSessionRoundPlayableDetermining {
    private readonly symbolId: string;
    private minLinesNumber = 1;
    private onlySameSymbolId = false;
    private allowWilds = true;
    private wildSymbolId?: string;
    private minNumberOfWinningSymbols?: number;
    private exactNumberOfWinningSymbols?: number;

    constructor(symbolId: string) {
        this.symbolId = symbolId;
    }

    public canPlayNextSimulationRound(session: VideoSlotSessionHandling): boolean {
        const rgSession = session;
        const symbolsCombination = rgSession.getSymbolsCombination();
        const winningLines = rgSession.getWinningLines();
        const winningLinesArray = Object.values(winningLines);
        const winningScatters = rgSession.getWinningScatters();

        let r: boolean;

        if (!session.isSymbolScatter(this.getSymbolId())) {
            r =
                Object.keys(winningLines).length < this.getMinLinesNumber() ||
                Object.keys(winningScatters).length > 0 ||
                WinningLinesAnalyzer.getLinesWithWinningSymbol(winningLinesArray, this.getSymbolId()).length === 0 ||
                (this.isOnlySameSymbolId() && !WinningLinesAnalyzer.allLinesHaveSameSymbolId(winningLinesArray)) ||
                (!this.isAllowWilds() &&
                    WinningLinesAnalyzer.getLinesWithSymbol(
                        winningLinesArray,
                        symbolsCombination.toMatrix(),
                        this.getWildSymbolId()!,
                    ).length > 0);

            if (
                this.getMinNumberOfWinningSymbols() !== undefined &&
                !Object.values(winningLines).some(
                    (line) => line.getSymbolsPositions().length >= this.getMinNumberOfWinningSymbols()!,
                )
            ) {
                r = true;
            }
            if (
                this.getExactNumberOfWinningSymbols() !== undefined &&
                !Object.values(winningLines).some(
                    (line) => line.getSymbolsPositions().length === this.getExactNumberOfWinningSymbols(),
                )
            ) {
                r = true;
            }
        } else {
            r =
                Object.keys(winningScatters).length === 0 ||
                Object.keys(winningLines).length > 0 ||
                !Object.keys(winningScatters).includes(this.getSymbolId());

            if (Object.keys(winningScatters).includes(this.getSymbolId())) {
                if (
                    this.getMinNumberOfWinningSymbols() !== undefined &&
                    winningScatters[this.getSymbolId()].getSymbolsPositions().length <
                        this.getMinNumberOfWinningSymbols()!
                ) {
                    r = true;
                }
                if (
                    this.getExactNumberOfWinningSymbols() !== undefined &&
                    winningScatters[this.getSymbolId()].getSymbolsPositions().length !==
                        this.getExactNumberOfWinningSymbols()
                ) {
                    r = true;
                }
            }
        }
        return r;
    }

    public getSymbolId(): string {
        return this.symbolId;
    }

    public getMinLinesNumber(): number {
        return this.minLinesNumber;
    }

    public setMinLinesNumber(minLinesNumber: number): void {
        this.minLinesNumber = minLinesNumber;
    }

    public isOnlySameSymbolId(): boolean {
        return this.onlySameSymbolId;
    }

    public setOnlySameSymbolId(onlySameSymbolId: boolean): void {
        this.onlySameSymbolId = onlySameSymbolId;
    }

    public isAllowWilds(): boolean {
        return this.allowWilds;
    }

    public setAllowWilds(allowWilds: boolean, wildSymbolId: string): void {
        this.allowWilds = allowWilds;
        this.wildSymbolId = wildSymbolId;
    }

    public getWildSymbolId(): string | undefined {
        return this.wildSymbolId;
    }

    public setMinNumberOfWinningSymbols(value: number): void {
        this.minNumberOfWinningSymbols = value;
    }

    public getMinNumberOfWinningSymbols(): number | undefined {
        return this.minNumberOfWinningSymbols;
    }

    public setExactNumberOfWinningSymbols(value: number): void {
        this.exactNumberOfWinningSymbols = value;
    }

    public getExactNumberOfWinningSymbols(): number | undefined {
        return this.exactNumberOfWinningSymbols;
    }
}
