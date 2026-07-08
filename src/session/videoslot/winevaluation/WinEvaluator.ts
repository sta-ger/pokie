import {WinComponent} from "./WinComponent.js";
import {WinEvaluationContext} from "./WinEvaluationContext.js";

export interface WinEvaluator<T extends string | number | symbol = string> {
    getEvaluatorId(): string;

    getEvaluatorGroup(): string;

    getComponentType(): string;

    getMetadata?(): Record<string, unknown>;

    evaluate(context: WinEvaluationContext<T>): WinComponent<T>[];
}
