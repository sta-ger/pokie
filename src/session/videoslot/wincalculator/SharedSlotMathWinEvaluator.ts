import type {SharedSlotMath} from "../../../wasm/math/SharedSlotMath.js";
import type {WinComponent} from "../winevaluation/WinComponent.js";
import type {WinEvaluationContext} from "../winevaluation/WinEvaluationContext.js";
import type {WinEvaluator} from "../winevaluation/WinEvaluator.js";
import {sharedMathEvaluationResult} from "./sharedMathEvaluationResult.js";

/** Adapts executable-selected components to the existing public pipeline contract. */
export class SharedSlotMathWinEvaluator<T extends string | number | symbol = string> implements WinEvaluator<T> {
    private readonly math: SharedSlotMath;
    public constructor(math: SharedSlotMath) {
        this.math = math;
    }
    public getEvaluatorId(): string {
        return "shared-slot-math";
    }
    public getEvaluatorGroup(): string {
        return "shared-slot-math";
    }
    public getComponentType(): string {
        return "shared-slot-math";
    }
    public evaluate(context: WinEvaluationContext<T>): WinComponent<T>[] {
        const result = this.math.evaluate(context.getSymbolsCombination().toMatrix() as string[][], context.getBet());
        return sharedMathEvaluationResult(this.math.model, result).getWinComponents() as unknown as WinComponent<T>[];
    }
}
