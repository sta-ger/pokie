import type {SharedSlotMathCalculating} from "../../../wasm/math/SharedSlotMath.js";
import type {WinComponent} from "../winevaluation/WinComponent.js";
import type {WinEvaluationContext} from "../winevaluation/WinEvaluationContext.js";
import type {WinEvaluator} from "../winevaluation/WinEvaluator.js";
import {sharedMathEvaluationResult} from "./sharedMathEvaluationResult.js";
import {assertSharedSlotMathConfig} from "./internal/resolveConfiguredSharedSlotMath.js";

/** Adapts executable-selected components to the existing public pipeline contract. */
export class SharedSlotMathWinEvaluator<T extends string | number | symbol = string> implements WinEvaluator<T> {
    private readonly math: SharedSlotMathCalculating;
    private readonly resolveConfiguredMath?: (context: WinEvaluationContext<T>) => SharedSlotMathCalculating;
    public constructor(math: SharedSlotMathCalculating, resolveConfiguredMath?: (context: WinEvaluationContext<T>) => SharedSlotMathCalculating) {
        this.math = math;
        this.resolveConfiguredMath = resolveConfiguredMath;
    }
    public getEvaluatorId(): string {
        return "shared-slot-math";
    }
    public getEvaluatorGroup(): string {
        if (this.math.model.winModel.type === "lines") return "line";
        return this.math.model.winModel.type === "clusters" ? "cluster" : "ways";
    }
    public getComponentType(): string {
        return "shared-slot-math";
    }
    public getMetadata(): Record<string, unknown> {
        return {minimumClusterSize: this.math.model.winModel.minimumClusterSize ?? 5};
    }
    public evaluate(context: WinEvaluationContext<T>): WinComponent<T>[] {
        if (!this.resolveConfiguredMath) assertSharedSlotMathConfig(context.getConfig(), this.math.model);
        const math = this.resolveConfiguredMath?.(context) ?? this.math;
        const result = math.evaluate(context.getSymbolsCombination().toMatrix() as string[][], this.resolveConfiguredMath ? 1 : context.getBet());
        return sharedMathEvaluationResult(math.model, result, context.getConfig().getLinesDefinitions().getLinesIds()).getWinComponents() as unknown as WinComponent<T>[];
    }
}
