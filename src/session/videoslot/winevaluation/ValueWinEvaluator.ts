import {ValueWinCalculating} from "../wincalculator/ValueWinCalculating.js";
import {WinningValueDescribing} from "../WinningValueDescribing.js";
import {ValueWinComponent} from "./ValueWinComponent.js";
import {WinComponent} from "./WinComponent.js";
import {WinEvaluationContext} from "./WinEvaluationContext.js";
import {WinEvaluator} from "./WinEvaluator.js";

export class ValueWinEvaluator<T extends string | number | symbol = string> implements WinEvaluator<T> {
    private readonly calculator: ValueWinCalculating<T>;

    constructor(calculator: ValueWinCalculating<T>) {
        this.calculator = calculator;
    }

    public getEvaluatorId(): string {
        return "value";
    }

    public getEvaluatorGroup(): string {
        return "value";
    }

    public getComponentType(): string {
        return "value";
    }

    public evaluate(context: WinEvaluationContext<T>): WinComponent<T>[] {
        const values = this.calculator.calculateWinningValues(context.getBet(), context.getSymbolsCombination());
        const valuesByKey = values as unknown as Record<string, WinningValueDescribing<T>>;
        return Object.values(valuesByKey).map((value) => new ValueWinComponent<T>(value));
    }
}
