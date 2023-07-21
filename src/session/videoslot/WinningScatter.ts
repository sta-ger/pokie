import {WinningScatterDescribing} from "pokie";

export class WinningScatter implements WinningScatterDescribing {
    private readonly symbolId: string;
    private readonly symbolsPositions: number[][];
    private readonly winAmount: number;

    constructor(symbolId: string, symbolsPositions: number[][], winAmount: number) {
        this.symbolId = symbolId;
        this.symbolsPositions = [...symbolsPositions];
        this.winAmount = winAmount;
    }

    public getSymbolId(): string {
        return this.symbolId;
    }

    public getSymbolsPositions(): number[][] {
        return [...this.symbolsPositions];
    }

    public getWinAmount(): number {
        return this.winAmount;
    }
}
