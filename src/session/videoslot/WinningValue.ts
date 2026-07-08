import {WinningValueDescribing} from "pokie";

export class WinningValue<T extends string | number | symbol = string> implements WinningValueDescribing<T> {
    private readonly symbolId: T;
    private readonly symbolsPositions: number[][];
    private readonly winAmount: number;

    constructor(symbolId: T, symbolsPositions: number[][], winAmount: number) {
        this.symbolId = symbolId;
        this.symbolsPositions = [...symbolsPositions];
        this.winAmount = winAmount;
    }

    public getSymbolId(): T {
        return this.symbolId;
    }

    public getSymbolsPositions(): number[][] {
        return [...this.symbolsPositions];
    }

    public getWinAmount(): number {
        return this.winAmount;
    }
}
