import type {WinEvaluationResult} from "../winevaluation/WinEvaluationResult.js";
import {CascadeStep} from "./CascadeStep.js";

export class CascadeResult<T extends string | number | symbol = string> {
    private readonly initialScreen: T[][];
    private readonly finalScreen: T[][];
    private readonly steps: CascadeStep<T>[];
    private readonly metadata: Record<string, unknown>;
    private readonly rngInfo: Record<string, unknown>;
    private readonly debugInfo: Record<string, unknown>;
    private readonly terminalEvaluation?: WinEvaluationResult<T>;

    constructor(
        initialScreen: T[][],
        finalScreen: T[][],
        steps: CascadeStep<T>[],
        metadata: Record<string, unknown> = {},
        rngInfo: Record<string, unknown> = {},
        debugInfo: Record<string, unknown> = {},
        terminalEvaluation: WinEvaluationResult<T> | undefined = undefined,
    ) {
        this.initialScreen = initialScreen.map((reel) => [...reel]);
        this.finalScreen = finalScreen.map((reel) => [...reel]);
        this.steps = [...steps];
        this.metadata = {...metadata};
        this.rngInfo = {...rngInfo};
        this.debugInfo = {...debugInfo};
        this.terminalEvaluation = terminalEvaluation;
    }

    public getTerminalEvaluation(): WinEvaluationResult<T> | undefined {
        return this.terminalEvaluation;
    }

    public getInitialScreen(): T[][] {
        return this.initialScreen.map((reel) => [...reel]);
    }

    public getFinalScreen(): T[][] {
        return this.finalScreen.map((reel) => [...reel]);
    }

    public getCascadeSteps(): CascadeStep<T>[] {
        return [...this.steps];
    }

    public getTotalCascadeWin(): number {
        return this.steps.reduce((sum, step) => sum + step.getWinEvaluationResult().getTotalWin(), 0);
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
            cascadeStepCount: this.steps.length,
        };
    }
}
