import {WinningLineDescribing} from "pokie";

export class WinningLine implements WinningLineDescribing {
    private readonly winAmount: number;
    private readonly definition: number[];
    private readonly pattern: number[];
    private readonly lineId: string;
    private readonly symbolsPositions: number[];
    private readonly wildSymbolsPositions: number[];
    private readonly symbolId: string;

    constructor(
        winAmount: number,
        definition: number[],
        pattern: number[],
        lineId: string,
        symbolsPositions: number[],
        wildSymbolsPositions: number[],
        symbolId: string,
    ) {
        this.winAmount = winAmount;
        this.definition = [...definition];
        this.pattern = [...pattern];
        this.lineId = lineId;
        this.symbolsPositions = [...symbolsPositions];
        this.wildSymbolsPositions = [...wildSymbolsPositions];
        this.symbolId = symbolId;
    }

    public getDefinition(): number[] {
        return [...this.definition];
    }

    public getSymbolId(): string {
        return this.symbolId;
    }

    public getLineId(): string {
        return this.lineId;
    }

    public getSymbolsPositions(): number[] {
        return [...this.symbolsPositions];
    }

    public getWildSymbolsPositions(): number[] {
        return [...this.wildSymbolsPositions];
    }

    public getWinAmount(): number {
        return this.winAmount;
    }

    public getPattern(): number[] {
        return this.pattern;
    }
}
