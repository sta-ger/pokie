import {VideoSlotConfigDescribing} from "../VideoSlotConfigDescribing.js";
import {SymbolsCombination} from "../combinations/SymbolsCombination.js";
import {CascadeGridTransformer} from "../combinations/CascadeGridTransformer.js";
import {WinEvaluationContext} from "../winevaluation/WinEvaluationContext.js";
import {WinEvaluationPipeline} from "../winevaluation/WinEvaluationPipeline.js";
import {CascadeResolverOptions} from "./CascadeResolverOptions.js";
import {CascadeRefillResult} from "./CascadeRefillResult.js";
import {CascadeResult} from "./CascadeResult.js";
import {CascadeStep} from "./CascadeStep.js";
import {MaxCascadeStepsExceededError} from "./MaxCascadeStepsExceededError.js";

export interface CascadeRefillProviding<T extends string | number | symbol = string> {
    getRefillSymbols(screen: T[][], removedPositions: number[][], stepIndex: number): T[][] | CascadeRefillResult<T>;
}

export class CascadingSpinResolver<T extends string | number | symbol = string> {
    private readonly pipeline: WinEvaluationPipeline<T>;
    private readonly config: VideoSlotConfigDescribing<T>;
    private readonly gridTransformer: CascadeGridTransformer;
    private readonly refillProvider: CascadeRefillProviding<T>;
    private readonly options: Required<CascadeResolverOptions>;

    constructor(
        pipeline: WinEvaluationPipeline<T>,
        config: VideoSlotConfigDescribing<T>,
        refillProvider: CascadeRefillProviding<T>,
        gridTransformer: CascadeGridTransformer = new CascadeGridTransformer(),
        options: CascadeResolverOptions = {},
    ) {
        this.pipeline = pipeline;
        this.config = config;
        this.refillProvider = refillProvider;
        this.gridTransformer = gridTransformer;
        this.options = {
            maxCascadeSteps: options.maxCascadeSteps ?? 100,
            onMaxCascadeStepsExceeded: options.onMaxCascadeStepsExceeded ?? "throw",
        };
    }

    public resolve(initialScreen: T[][], bet: number): CascadeResult<T> {
        const steps: CascadeStep<T>[] = [];
        let currentScreen = initialScreen.map((reel) => [...reel]);
        let stepIndex = 0;
        for (;;) {
            if (stepIndex >= this.options.maxCascadeSteps) {
                if (this.options.onMaxCascadeStepsExceeded === "stop") {
                    return new CascadeResult<T>(
                        initialScreen,
                        currentScreen,
                        steps,
                        {
                            totalSteps: steps.length,
                            maxCascadeStepsExceeded: true,
                            warning: `Cascade stopped after reaching maxCascadeSteps=${this.options.maxCascadeSteps}`,
                        },
                        {
                            cascadeStepCount: steps.length,
                        },
                        {
                            totalCascadeWin: steps.reduce((sum, step) => sum + step.getWinEvaluationResult().getTotalWin(), 0),
                        },
                    );
                }
                throw new MaxCascadeStepsExceededError(this.options.maxCascadeSteps, stepIndex);
            }
            const combination = new SymbolsCombination<T>().fromMatrix(currentScreen);
            const result = this.pipeline.evaluate(
                new WinEvaluationContext<T>(bet, combination, this.config, {cascadeStepIndex: stepIndex}),
            );
            const removedPositions = result.getWinningPositions();
            if (removedPositions.length === 0) {
                break;
            }
            const refillResult = this.normalizeRefillResult(
                this.refillProvider.getRefillSymbols(currentScreen, removedPositions, stepIndex),
            );
            steps.push(
                new CascadeStep<T>(
                    currentScreen,
                    result,
                    removedPositions,
                    refillResult.refillSymbols,
                    {
                        cascadeStepIndex: stepIndex,
                    },
                    refillResult.rngInfo,
                    refillResult.debugInfo,
                ),
            );
            currentScreen = this.gridTransformer.collapseAndRefill(currentScreen, removedPositions, refillResult.refillSymbols);
            stepIndex++;
        }
        return new CascadeResult<T>(initialScreen, currentScreen, steps, {
            totalSteps: steps.length,
        }, {
            cascadeStepCount: steps.length,
        }, {
            totalCascadeWin: steps.reduce((sum, step) => sum + step.getWinEvaluationResult().getTotalWin(), 0),
        });
    }

    private normalizeRefillResult(refillResult: T[][] | CascadeRefillResult<T>): CascadeRefillResult<T> {
        if (Array.isArray(refillResult) && (refillResult.length === 0 || Array.isArray(refillResult[0]))) {
            return {refillSymbols: refillResult as T[][]};
        }
        return refillResult as CascadeRefillResult<T>;
    }
}
