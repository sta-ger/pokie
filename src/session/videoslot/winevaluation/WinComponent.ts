import {WinAmountDetermining} from "../../WinAmountDetermining.js";
import {WinMultiplierBreakdown} from "./WinMultiplierBreakdown.js";

export abstract class WinComponent<T extends string | number | symbol = string> implements WinAmountDetermining {
    private readonly type: string;
    private readonly id: string;
    private readonly symbolId: T;
    private readonly winAmount: number;
    private readonly winningPositions: number[][];
    private readonly multiplierBreakdown: WinMultiplierBreakdown[];
    private readonly metadata: Record<string, unknown>;

    protected constructor(
        type: string,
        id: string,
        symbolId: T,
        winAmount: number,
        winningPositions: number[][],
        multiplierBreakdown: WinMultiplierBreakdown[] = [],
        metadata: Record<string, unknown> = {},
    ) {
        this.type = type;
        this.id = id;
        this.symbolId = symbolId;
        this.winAmount = winAmount;
        this.winningPositions = winningPositions.map((position) => [...position]);
        this.multiplierBreakdown = multiplierBreakdown.map((breakdown) => ({
            ...breakdown,
            positions: breakdown.positions.map((position) => [...position]),
            values: [...breakdown.values],
        }));
        this.metadata = {...metadata};
    }

    public getType(): string {
        return this.type;
    }

    public getId(): string {
        return this.id;
    }

    public getSymbolId(): T {
        return this.symbolId;
    }

    public getWinAmount(): number {
        return this.winAmount;
    }

    public getWinningPositions(): number[][] {
        return this.winningPositions.map((position) => [...position]);
    }

    public getMultiplierBreakdown(): WinMultiplierBreakdown[] {
        return this.multiplierBreakdown.map((breakdown) => ({
            ...breakdown,
            positions: breakdown.positions.map((position) => [...position]),
            values: [...breakdown.values],
        }));
    }

    public getMetadata(): Record<string, unknown> {
        return {...this.metadata};
    }
}
