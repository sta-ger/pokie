import type {WinningWayDescribing} from "./WinningWayDescribing.js";

export class WinningWay<T extends string | number | symbol = string> implements WinningWayDescribing<T> {
    private readonly symbolId: T;
    private readonly symbolsPositions: number[][];
    private readonly waysCount: number;
    private readonly winAmount: number;

    constructor(symbolId: T, symbolsPositions: number[][], waysCount: number, winAmount: number) {
        this.symbolId = symbolId;
        this.symbolsPositions = [...symbolsPositions];
        this.waysCount = waysCount;
        this.winAmount = winAmount;
    }

    public getSymbolId(): T {
        return this.symbolId;
    }

    public getSymbolsPositions(): number[][] {
        return [...this.symbolsPositions];
    }

    public getWaysCount(): number {
        return this.waysCount;
    }

    public getWinAmount(): number {
        return this.winAmount;
    }
}
