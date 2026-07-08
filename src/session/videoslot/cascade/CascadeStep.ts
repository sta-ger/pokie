import {WinEvaluationResult} from "../winevaluation/WinEvaluationResult.js";

export class CascadeStep<T extends string | number | symbol = string> {
    private readonly screen: T[][];
    private readonly winEvaluationResult: WinEvaluationResult<T>;
    private readonly removedPositions: number[][];
    private readonly refillSymbols: T[][];
    private readonly metadata: Record<string, unknown>;
    private readonly rngInfo: Record<string, unknown>;
    private readonly debugInfo: Record<string, unknown>;

    constructor(
        screen: T[][],
        winEvaluationResult: WinEvaluationResult<T>,
        removedPositions: number[][],
        refillSymbols: T[][],
        metadata: Record<string, unknown> = {},
        rngInfo: Record<string, unknown> = {},
        debugInfo: Record<string, unknown> = {},
    ) {
        this.screen = screen.map((reel) => [...reel]);
        this.winEvaluationResult = winEvaluationResult;
        this.removedPositions = removedPositions.map((position) => [...position]);
        this.refillSymbols = refillSymbols.map((reel) => [...reel]);
        this.metadata = {...metadata};
        this.rngInfo = {...rngInfo};
        this.debugInfo = {...debugInfo};
    }

    public getScreen(): T[][] {
        return this.screen.map((reel) => [...reel]);
    }

    public getWinEvaluationResult(): WinEvaluationResult<T> {
        return this.winEvaluationResult;
    }

    public getRemovedPositions(): number[][] {
        return this.removedPositions.map((position) => [...position]);
    }

    public getRefillSymbols(): T[][] {
        return this.refillSymbols.map((reel) => [...reel]);
    }

    public getMetadata(): Record<string, unknown> {
        return {...this.metadata};
    }

    public getRngInfo(): Record<string, unknown> {
        return {...this.rngInfo};
    }

    public getDebugInfo(): Record<string, unknown> {
        return {
            ...this.debugInfo,
            multiplierBreakdown: this.winEvaluationResult.getMultiplierBreakdown(),
        };
    }
}
